import { NextResponse, type NextRequest } from "next/server";
import { isPaidTier, priceIdFor } from "@/lib/plans";
import { absoluteUrl } from "@/lib/site";
import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

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
  // The free tier is provisioned at signup, never through checkout.
  if (!isPaidTier(tier)) {
    return NextResponse.json({ error: "unknown tier" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: sub } = await admin
    .from("subscriptions")
    .select("stripe_customer_id, stripe_subscription_id, status")
    .eq("user_id", user.id)
    .maybeSingle();

  // Already on a paid Stripe subscription → plan changes go through the
  // billing portal. Cardless free rows (active, no Stripe sub) fall through
  // to a fresh checkout.
  if (
    sub?.stripe_subscription_id &&
    ["active", "trialing", "past_due"].includes(sub.status)
  ) {
    return NextResponse.redirect(absoluteUrl("/keys", request), 303);
  }

  let customerId = sub?.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email ?? undefined,
      metadata: { user_id: user.id },
    });
    customerId = customer.id;
    // Eagerly record the customer so webhook events can always resolve the
    // user by customer id, regardless of event ordering.
    const { error } = await admin.from("subscriptions").upsert(
      { user_id: user.id, stripe_customer_id: customerId },
      { onConflict: "user_id" },
    );
    if (error) {
      console.error("subscriptions upsert failed:", error);
      return NextResponse.json({ error: "internal error" }, { status: 500 });
    }
  }

  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? request.nextUrl.origin;
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    client_reference_id: user.id,
    line_items: [{ price: priceIdFor(tier), quantity: 1 }],
    subscription_data: { metadata: { user_id: user.id } },
    success_url: `${origin}/keys?checkout=success`,
    cancel_url: `${origin}/`,
  });

  return NextResponse.redirect(session.url!, 303);
}
