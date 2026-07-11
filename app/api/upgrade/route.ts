import { NextResponse, type NextRequest } from "next/server";
import { isPaidTier, priceIdFor } from "@/lib/plans";
import { absoluteUrl } from "@/lib/site";
import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const ACTIVE = ["active", "trialing", "past_due"];

// Upgrade an existing subscription in place (e.g. free -> a paid tier). The
// free tier already has a card on file, so the prorated charge runs against
// it immediately. If payment can't complete seamlessly (e.g. SCA), fall back
// to the billing portal so the user can finish there.
export async function POST(request: NextRequest) {
  const stripe = getStripe();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(absoluteUrl("/login", request), 303);
  }

  const form = await request.formData();
  const tier = String(form.get("tier") ?? "");
  if (!isPaidTier(tier)) {
    return NextResponse.json({ error: "invalid target tier" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: sub } = await admin
    .from("subscriptions")
    .select("stripe_customer_id, stripe_subscription_id, status, tier")
    .eq("user_id", user.id)
    .maybeSingle();

  // No usable subscription yet → start a fresh checkout instead.
  if (!sub?.stripe_subscription_id || !ACTIVE.includes(sub.status)) {
    return NextResponse.redirect(absoluteUrl("/#pricing", request), 303);
  }
  if (sub.tier === tier) {
    return NextResponse.redirect(absoluteUrl("/keys", request), 303);
  }

  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? request.nextUrl.origin;

  try {
    const current = await stripe.subscriptions.retrieve(sub.stripe_subscription_id);
    const itemId = current.items.data[0]?.id;
    if (!itemId) throw new Error("no subscription item to update");

    await stripe.subscriptions.update(sub.stripe_subscription_id, {
      items: [{ id: itemId, price: priceIdFor(tier) }],
      // Bill the prorated difference now; error out (not "incomplete") if the
      // card can't be charged, so we can route to the portal.
      proration_behavior: "always_invoice",
      payment_behavior: "error_if_incomplete",
    });
    // The customer.subscription.updated webhook syncs tier/quota/period.
    return NextResponse.redirect(`${origin}/keys?upgraded=1`, 303);
  } catch (e) {
    console.error("in-place upgrade failed, falling back to portal:", e);
    try {
      const portal = await stripe.billingPortal.sessions.create({
        customer: sub.stripe_customer_id,
        return_url: `${origin}/keys`,
      });
      return NextResponse.redirect(portal.url, 303);
    } catch {
      return NextResponse.redirect(`${origin}/keys?upgrade=failed`, 303);
    }
  }
}
