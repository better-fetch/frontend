import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { PLANS, tierFromPriceId } from "@/lib/plans";
import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function epochToIso(seconds: number | null | undefined): string | null {
  return seconds ? new Date(seconds * 1000).toISOString() : null;
}

async function upsertSubscription(sub: Stripe.Subscription) {
  const admin = createAdminClient();
  const customerId =
    typeof sub.customer === "string" ? sub.customer : sub.customer.id;

  // Internal-tier rows (unmetered staff/testing accounts) are managed by
  // hand; Stripe events for their leftover $0 subscriptions must not
  // clobber the tier/quota back to a paid plan's.
  const { data: existing } = await admin
    .from("subscriptions")
    .select("tier")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  if (existing?.tier === "internal") return;

  // Period fields live on the subscription item since the basil API.
  const item = sub.items.data[0];
  const priceId = item?.price?.id ?? null;
  const tier = priceId ? tierFromPriceId(priceId) : null;
  const quota = tier ? PLANS[tier].quota : 0;
  const sessionLimit = tier ? PLANS[tier].sessionLimit : 0;
  const sessionIdleTtlDays = tier ? PLANS[tier].sessionIdleTtlDays : 7;

  const patch = {
    stripe_subscription_id: sub.id,
    status: sub.status,
    tier,
    monthly_quota: quota,
    session_limit: sessionLimit,
    session_idle_ttl_days: sessionIdleTtlDays,
    current_period_start: epochToIso(item?.current_period_start),
    current_period_end: epochToIso(item?.current_period_end),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await admin
    .from("subscriptions")
    .update(patch)
    .eq("stripe_customer_id", customerId)
    .select("user_id");
  if (error) throw error;
  if (data?.length) return;

  // Row missing — the eager upsert in /api/checkout failed or was skipped.
  // Fall back to the user_id we stamped into subscription metadata.
  const userId = sub.metadata?.user_id;
  if (!userId) {
    console.error(`no subscriptions row for customer ${customerId} and no user_id metadata`);
    return;
  }
  const { error: insertError } = await admin.from("subscriptions").upsert(
    { user_id: userId, stripe_customer_id: customerId, ...patch },
    { onConflict: "user_id" },
  );
  if (insertError) throw insertError;
}

export async function POST(request: NextRequest) {
  const stripe = getStripe();
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!,
    );
  } catch (err) {
    console.error("webhook signature verification failed:", err);
    return NextResponse.json({ error: "bad signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        // Re-fetch instead of trusting the event payload: events can arrive
        // out of order, and the API always returns the current state.
        // For deletions the object is gone, so use the payload's final state.
        const payload = event.data.object;
        const sub =
          event.type === "customer.subscription.deleted"
            ? payload
            : await stripe.subscriptions.retrieve(payload.id);
        await upsertSubscription(sub);
        break;
      }
      default:
        break;
    }
  } catch (err) {
    console.error(`webhook handler failed for ${event.type}:`, err);
    return NextResponse.json({ error: "handler error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
