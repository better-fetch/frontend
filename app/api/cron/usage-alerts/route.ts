import { NextResponse, type NextRequest } from "next/server";
import { sendEmail } from "@/lib/email";
import { isTier, PLANS } from "@/lib/plans";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://betterfetch.co";
const ACTIVE = ["active", "trialing", "past_due"];

type SubRow = {
  user_id: string;
  tier: string | null;
  monthly_quota: number;
  current_period_start: string | null;
  current_period_end: string | null;
};
type UsageRow = {
  user_id: string;
  period_start: string;
  calls: number;
  notified_80: boolean;
  notified_100: boolean;
};

function planName(tier: string | null): string {
  return tier && isTier(tier) ? PLANS[tier].name : "your plan";
}

// Suggest the next tier up, or null for the top tier.
function nextTier(tier: string | null): "starter" | "pro" | "scale" | null {
  switch (tier) {
    case "free":
      return "starter";
    case "starter":
      return "pro";
    case "pro":
      return "scale";
    default:
      return null;
  }
}

function shell(body: string): string {
  return `<div style="font-family:ui-monospace,Menlo,monospace;font-size:14px;line-height:1.6;color:#111;max-width:520px">
${body}
<p style="color:#888;font-size:12px;margin-top:24px">Better Fetch · <a href="${SITE}" style="color:#888">betterfetch.co</a></p>
</div>`;
}

function nudgeEmail(sub: SubRow, calls: number) {
  const up = nextTier(sub.tier);
  const cta = up
    ? `<p><a href="${SITE}/keys" style="display:inline-block;background:#111;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Upgrade to ${PLANS[up].name} →</a></p>
       <p style="color:#666">${PLANS[up].name} gives you ${PLANS[up].quota.toLocaleString()} calls/mo.</p>`
    : `<p style="color:#666">You're on our top plan. <a href="${SITE}/keys">Manage your plan →</a></p>`;
  return {
    subject: `You've used 80% of your Better Fetch quota`,
    html: shell(
      `<p>Heads up — you've used <strong>${calls.toLocaleString()}</strong> of your <strong>${sub.monthly_quota.toLocaleString()}</strong> calls on ${planName(sub.tier)} this billing period (80%).</p>
       <p>Once you hit the limit, requests return <code>429</code> until your quota resets${
         sub.current_period_end
           ? ` on ${new Date(sub.current_period_end).toISOString().slice(0, 10)}`
           : ""
       }.</p>
       ${cta}`,
    ),
  };
}

function capEmail(sub: SubRow) {
  const up = nextTier(sub.tier);
  const resets = sub.current_period_end
    ? new Date(sub.current_period_end).toISOString().slice(0, 10)
    : "your next billing cycle";
  const cta = up
    ? `<p><a href="${SITE}/keys" style="display:inline-block;background:#111;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Upgrade to ${PLANS[up].name} →</a></p>
       <p style="color:#666">Upgrading restores service immediately with ${PLANS[up].quota.toLocaleString()} calls/mo.</p>`
    : `<p style="color:#666"><a href="${SITE}/keys">Manage your plan →</a></p>`;
  return {
    subject: `You've hit your Better Fetch limit`,
    html: shell(
      `<p>You've used all <strong>${sub.monthly_quota.toLocaleString()}</strong> calls on ${planName(sub.tier)} this period. Requests now return <code>429</code> until your quota resets on <strong>${resets}</strong>.</p>
       ${cta}`,
    ),
  };
}

export async function POST(request: NextRequest) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const [{ data: subs }, { data: usage }] = await Promise.all([
    admin
      .from("subscriptions")
      .select("user_id, tier, monthly_quota, current_period_start, current_period_end")
      .in("status", ACTIVE)
      .gt("monthly_quota", 0)
      .returns<SubRow[]>(),
    admin
      .from("usage_counters")
      .select("user_id, period_start, calls, notified_80, notified_100")
      .returns<UsageRow[]>(),
  ]);

  if (!subs?.length) {
    return NextResponse.json({ checked: 0, nudged: 0, capped: 0 });
  }

  const usageByKey = new Map(
    (usage ?? []).map((u) => [`${u.user_id}|${u.period_start}`, u]),
  );

  let nudged = 0;
  let capped = 0;

  for (const sub of subs) {
    if (!sub.current_period_start) continue;
    const u = usageByKey.get(`${sub.user_id}|${sub.current_period_start}`);
    if (!u) continue;

    const pct = u.calls / sub.monthly_quota;
    const atCap = pct >= 1 && !u.notified_100;
    const atNudge = pct >= 0.8 && pct < 1 && !u.notified_80;
    if (!atCap && !atNudge) continue;

    // Resolve the email (auth schema isn't exposed to PostgREST).
    const { data: userRes } = await admin.auth.admin.getUserById(sub.user_id);
    const email = userRes?.user?.email;
    if (!email) continue;

    try {
      if (atCap) {
        const { subject, html } = capEmail(sub);
        await sendEmail(email, subject, html);
        await admin
          .from("usage_counters")
          .update({ notified_100: true, notified_80: true })
          .eq("user_id", sub.user_id)
          .eq("period_start", sub.current_period_start);
        capped++;
      } else {
        const { subject, html } = nudgeEmail(sub, u.calls);
        await sendEmail(email, subject, html);
        await admin
          .from("usage_counters")
          .update({ notified_80: true })
          .eq("user_id", sub.user_id)
          .eq("period_start", sub.current_period_start);
        nudged++;
      }
    } catch (e) {
      // Don't flip the flag if the send failed — it'll retry next run.
      console.error(`usage-alert send failed for ${sub.user_id}:`, e);
    }
  }

  return NextResponse.json({ checked: subs.length, nudged, capped });
}
