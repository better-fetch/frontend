import "server-only";

export type PeriodSource = {
  stripe_subscription_id: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
};

// Must mirror check_and_increment_usage: Stripe-backed subscriptions meter
// against the webhook-written billing period; cardless (free) rows meter
// against the current UTC month. Returns null when a Stripe-backed row has
// no period yet (mid-webhook) — metering treats that as no_subscription.
export function effectivePeriod(
  sub: PeriodSource,
): { start: Date; end: Date | null } | null {
  if (sub.stripe_subscription_id) {
    if (!sub.current_period_start) return null;
    return {
      start: new Date(sub.current_period_start),
      end: sub.current_period_end ? new Date(sub.current_period_end) : null,
    };
  }
  const now = new Date();
  return {
    start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
    end: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)),
  };
}

export function callsInPeriod(
  usageRows: { period_start: string; calls: number }[] | null | undefined,
  periodStart: Date,
): number {
  return (
    usageRows?.find(
      (u) => new Date(u.period_start).getTime() === periodStart.getTime(),
    )?.calls ?? 0
  );
}
