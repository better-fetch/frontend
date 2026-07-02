import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PLANS, isTier } from "@/lib/plans";
import { createClient, getClaims } from "@/lib/supabase/server";
import { ClearSessionButton, KeyActions, RevokeButton } from "./key-actions";

export const dynamic = "force-dynamic";

type SubscriptionRow = {
  status: string;
  tier: string | null;
  monthly_quota: number;
  session_limit: number;
  session_idle_ttl_days: number;
  current_period_start: string | null;
  current_period_end: string | null;
};

type BrowserSessionRow = {
  id: string;
  session_name: string;
  country: string | null;
  context_key: string;
  created_at: string;
  last_used_at: string;
  expires_at: string;
  snapshot_updated_at: string | null;
  snapshot_bytes: number | null;
};

const CURL_EXAMPLE = `curl -s https://api.betterfetch.co/v1/fetch \\
  -H "Authorization: Bearer <your-key>" \\
  -H "Content-Type: application/json" \\
  -d '{"url": "https://example.com"}'`;

const PAID_TIERS = ["starter", "pro", "scale"] as const;

export default async function KeysPage({
  searchParams,
}: {
  searchParams: Promise<{ upgraded?: string; upgrade?: string }>;
}) {
  if (!(await getClaims())) redirect("/login");
  const supabase = await createClient();
  const params = await searchParams;

  // The user has only a handful of usage rows (one per billing period), so
  // fetch them alongside the subscription and match the period in JS rather
  // than waterfalling a second round trip behind the subscription query.
  const [{ data: keys }, { data: sub }, { data: usageRows }, { data: sessions }] =
    await Promise.all([
      supabase
        .from("api_keys")
        .select("id, name, key_prefix, created_at, last_used_at, revoked_at")
        .is("revoked_at", null)
        .order("created_at", { ascending: false }),
      supabase.from("subscriptions").select("*").maybeSingle<SubscriptionRow>(),
      supabase
        .from("usage_counters")
        .select("period_start, calls")
        .returns<{ period_start: string; calls: number }[]>(),
      supabase
        .from("browser_sessions")
        .select(
          "id, session_name, country, context_key, created_at, last_used_at, expires_at, snapshot_updated_at, snapshot_bytes",
        )
        .is("revoked_at", null)
        .is("deleted_at", null)
        .gt("expires_at", new Date().toISOString())
        .order("last_used_at", { ascending: false })
        .returns<BrowserSessionRow[]>(),
    ]);

  const subscribed =
    sub && ["active", "trialing", "past_due"].includes(sub.status);

  const used =
    (subscribed &&
      usageRows?.find((u) => u.period_start === sub.current_period_start)
        ?.calls) ||
    0;

  const isFree = subscribed && sub.tier === "free";
  const sessionLimit =
    subscribed && typeof sub.session_limit === "number"
      ? sub.session_limit
      : sub?.tier && isTier(sub.tier)
        ? PLANS[sub.tier].sessionLimit
        : 0;
  const sessionTtl =
    subscribed && typeof sub.session_idle_ttl_days === "number"
      ? sub.session_idle_ttl_days
      : sub?.tier && isTier(sub.tier)
        ? PLANS[sub.tier].sessionIdleTtlDays
        : 7;
  const activeSessions = sessions?.length ?? 0;
  const sessionsTableClassName =
    activeSessions > 5
      ? "max-h-[22rem] overflow-y-auto rounded-lg border"
      : "";

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">API keys</h1>

      {params.upgraded ? (
        <p className="rounded-lg border border-foreground/20 bg-muted/50 px-4 py-2 text-sm">
          Plan upgrade submitted. Stripe will sync the new tier and quota here shortly.
        </p>
      ) : null}
      {params.upgrade === "failed" ? (
        <p className="rounded-lg border border-destructive/40 px-4 py-2 text-sm text-destructive">
          We couldn&apos;t complete the upgrade. Try &ldquo;Manage billing&rdquo; below.
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Plan</CardTitle>
            {subscribed ? (
              <div className="flex items-center gap-2">
                <Badge variant="secondary">
                  {sub.tier && isTier(sub.tier)
                    ? PLANS[sub.tier].name
                    : (sub.tier ?? "Unknown")}
                </Badge>
                {sub.status !== "active" ? (
                  <Badge variant="destructive">{sub.status}</Badge>
                ) : null}
              </div>
            ) : null}
          </div>
          {subscribed ? (
            <CardDescription>
              {sub.monthly_quota.toLocaleString()} calls per month
              {` · ${sessionLimit.toLocaleString()} stored browser session${
                sessionLimit === 1 ? "" : "s"
              }`}
              {sub.current_period_end
                ? ` · resets ${new Date(sub.current_period_end).toISOString().slice(0, 10)}`
                : ""}
            </CardDescription>
          ) : (
            <CardDescription>
              No active subscription — keys won&apos;t work until you pick a
              plan.
            </CardDescription>
          )}
        </CardHeader>
        {subscribed ? (
          <CardContent className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Usage this period</span>
              <span>
                {used.toLocaleString()} / {sub.monthly_quota.toLocaleString()}
              </span>
            </div>
            <Progress
              value={Math.min(100, (used / Math.max(1, sub.monthly_quota)) * 100)}
            />
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">
                Stored browser sessions
              </span>
              <span>
                {activeSessions.toLocaleString()} / {sessionLimit.toLocaleString()}
              </span>
            </div>
            <Progress
              value={Math.min(100, (activeSessions / Math.max(1, sessionLimit)) * 100)}
            />
            <p className="text-xs text-muted-foreground">
              Named sessions expire after {sessionTtl} idle day
              {sessionTtl === 1 ? "" : "s"}.
            </p>
          </CardContent>
        ) : null}
        <CardFooter>
          {subscribed ? (
            <form action="/api/portal" method="post">
              <Button variant="outline" type="submit">
                Manage billing
              </Button>
            </form>
          ) : (
            <Button asChild>
              <Link href="/#pricing">Pick a plan</Link>
            </Button>
          )}
        </CardFooter>
      </Card>

      {isFree ? (
        <div className="upgrade-ring">
          <div className="space-y-4 rounded-[0.72rem] bg-background p-6">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold tracking-tight">
                Upgrade your plan
              </h2>
              <p className="text-sm text-muted-foreground">
                You&apos;re on Free (50 calls/mo and 1 stored browser session).
                Move up anytime — your card on file is charged the prorated
                difference, and your new quota takes effect immediately.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {PAID_TIERS.map((t) => (
                <div
                  key={t}
                  className="flex flex-col gap-2 rounded-lg border p-4"
                >
                  <div className="font-medium">{PLANS[t].name}</div>
                  <div className="text-sm text-muted-foreground">
                    ${PLANS[t].usd}/mo · {PLANS[t].quota.toLocaleString()} calls
                    · {PLANS[t].sessionLimit.toLocaleString()} sessions
                  </div>
                  <form
                    action="/api/upgrade"
                    method="post"
                    className="mt-auto pt-1"
                  >
                    <input type="hidden" name="tier" value={t} />
                    <Button
                      type="submit"
                      className="w-full"
                      variant={t === "pro" ? "default" : "outline"}
                    >
                      Upgrade to {PLANS[t].name}
                    </Button>
                  </form>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Browser sessions</CardTitle>
          <CardDescription>
            Named sessions are isolated to your account and store browser
            cookies and localStorage in encrypted portable snapshots until
            they expire or are cleared. Local browser profiles act as a
            machine cache.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sessions && sessions.length > 0 ? (
            <div className={sessionsTableClassName}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Session</TableHead>
                    <TableHead>Country</TableHead>
                    <TableHead>Last used</TableHead>
                    <TableHead>Snapshot</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sessions.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-mono text-xs">
                        {s.session_name}
                      </TableCell>
                      <TableCell>{s.country ?? "default"}</TableCell>
                      <TableCell>
                        {new Date(s.last_used_at).toISOString().slice(0, 10)}
                      </TableCell>
                      <TableCell>
                        {s.snapshot_updated_at
                          ? `synced ${new Date(s.snapshot_updated_at).toISOString().slice(0, 10)}`
                          : "pending"}
                      </TableCell>
                      <TableCell>
                        {new Date(s.expires_at).toISOString().slice(0, 10)}
                      </TableCell>
                      <TableCell className="text-right">
                        <ClearSessionButton id={s.id} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No stored browser sessions yet. Send a <code>session</code> value
              to create one.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Keys</CardTitle>
          <CardDescription>
            Keys are shown once at creation — only a hash is stored. Keep them
            server-side.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <KeyActions />
          {keys && keys.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Key</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Last used</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {keys.map((k) => (
                  <TableRow key={k.id}>
                    <TableCell>{k.name}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {k.key_prefix}…
                    </TableCell>
                    <TableCell>
                      {new Date(k.created_at).toISOString().slice(0, 10)}
                    </TableCell>
                    <TableCell>
                      {k.last_used_at
                        ? new Date(k.last_used_at).toISOString().slice(0, 10)
                        : "never"}
                    </TableCell>
                    <TableCell className="text-right">
                      <RevokeButton id={k.id} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">No keys yet.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Quick start</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <pre className="overflow-x-auto rounded-lg border bg-muted/50 p-4 font-mono text-xs leading-relaxed">
            {CURL_EXAMPLE}
          </pre>
          <Button variant="link" className="px-0" asChild>
            <Link href="/docs">Full API docs →</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
