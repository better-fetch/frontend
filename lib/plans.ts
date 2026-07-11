import "server-only";

export const PLANS = {
  free: { name: "Free", usd: 0, quota: 50, sessionLimit: 1, sessionIdleTtlDays: 7 },
  starter: { name: "Starter", usd: 19, quota: 25_000, sessionLimit: 10, sessionIdleTtlDays: 7 },
  pro: { name: "Pro", usd: 49, quota: 100_000, sessionLimit: 50, sessionIdleTtlDays: 7 },
  scale: { name: "Scale", usd: 199, quota: 500_000, sessionLimit: 250, sessionIdleTtlDays: 7 },
} as const;

export type Tier = keyof typeof PLANS;

// The free tier is provisioned directly at signup (no Stripe object); only
// paid tiers have Stripe prices.
export const PAID_TIERS = ["starter", "pro", "scale"] as const satisfies readonly Tier[];
export type PaidTier = (typeof PAID_TIERS)[number];

export function isTier(value: string): value is Tier {
  return value in PLANS;
}

export function isPaidTier(value: string): value is PaidTier {
  return (PAID_TIERS as readonly string[]).includes(value);
}

// Price IDs come from env so test and live mode don't require code changes.
export function priceIdFor(tier: PaidTier): string {
  const id = {
    starter: process.env.STRIPE_PRICE_STARTER,
    pro: process.env.STRIPE_PRICE_PRO,
    scale: process.env.STRIPE_PRICE_SCALE,
  }[tier];
  if (!id) throw new Error(`missing Stripe price ID for tier ${tier}`);
  return id;
}

export function tierFromPriceId(priceId: string): Tier | null {
  for (const tier of PAID_TIERS) {
    if (priceIdFor(tier) === priceId) return tier;
  }
  return null;
}
