import Link from "next/link";
import { redirect } from "next/navigation";
import { AgentInstallTabs } from "@/components/agent-install-tabs";
import { CheckIcon, McpIcon } from "@/components/icons";
import { ToolCard } from "@/components/tool-card";
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
import { PLANS, type Tier } from "@/lib/plans";
import { getClaims } from "@/lib/supabase/server";
import { getPopularTools } from "@/lib/tool-display";
import { getLiveTools } from "@/lib/tools-registry";

const FEATURES: Record<Tier, string[]> = {
  free: ["50 calls / month", "1 stored browser session", "OAuth or API key"],
  starter: ["25,000 calls / month", "10 stored browser sessions", "Screenshots"],
  pro: ["100,000 calls / month", "Residential routing", "50 stored browser sessions"],
  scale: ["500,000 calls / month", "Everything in Pro", "250 stored browser sessions"],
};

const CAPABILITIES = [
  {
    title: "Escalates only when needed",
    description:
      "Starts with fast HTTP, moves to Chromium for rendered pages, and can use residential egress when a target blocks direct traffic.",
  },
  {
    title: "Keeps the browser state",
    description:
      "Account-scoped sessions preserve cookies, localStorage, browser identity, and cache across an agent's multi-step work.",
  },
  {
    title: "Returns data, not browser noise",
    description:
      "Fetch pages, discover the APIs behind them, extract structured JSON, capture screenshots, or run a ready-made scraper.",
  },
];

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;
  if (code) redirect(`/auth/confirm?code=${encodeURIComponent(code)}`);

  const [signedIn, tools] = await Promise.all([
    getClaims().then(Boolean),
    getLiveTools({ force: true }).catch(() => []),
  ]);
  const popularTools = getPopularTools(tools, 6);

  return (
    <div className="space-y-24">
      <section className="relative space-y-8 overflow-hidden pt-8 text-center sm:pt-14">
        <div className="pointer-events-none absolute inset-x-1/4 top-0 -z-10 h-64 rounded-full bg-primary/10 blur-3xl" />
        <div className="space-y-5">
          <Badge variant="outline" className="border-primary/30 bg-primary/5 text-primary">
            The web data layer for AI
          </Badge>
          <h1 className="mx-auto max-w-3xl text-4xl font-semibold tracking-tight sm:text-6xl">
            Give your AI a better fetch.
          </h1>
          <p className="mx-auto max-w-2xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
            Install one MCP connector. Claude and ChatGPT can render JavaScript,
            keep browser sessions, route regionally, discover APIs, and return
            structured web data—without glue code.
          </p>
        </div>
        <AgentInstallTabs />
      </section>

      {popularTools.length > 0 ? (
        <section id="tools" className="space-y-6">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wider text-primary">
                Ready-made capabilities
              </p>
              <h2 className="text-2xl font-semibold tracking-tight">
                Ask for the data. Skip the scraper code.
              </h2>
            </div>
            <Button variant="outline" asChild>
              <Link href="/tools">Browse all {tools.length} tools</Link>
            </Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {popularTools.map((tool) => (
              <ToolCard key={tool.id} tool={tool} />
            ))}
          </div>
        </section>
      ) : null}

      <section className="space-y-8">
        <div className="space-y-2 text-center">
          <p className="text-xs font-medium uppercase tracking-wider text-primary">
            Agent-native retrieval
          </p>
          <h2 className="text-3xl font-semibold tracking-tight">
            One connector. The right fetch strategy.
          </h2>
          <p className="mx-auto max-w-2xl text-muted-foreground">
            Better Fetch gives the model both the tools and the operating rules
            to retrieve the web reliably, without blindly retrying expensive browser calls.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {CAPABILITIES.map((capability, index) => (
            <Card key={capability.title} className="relative overflow-hidden">
              <CardHeader>
                <div className="mb-2 flex size-9 items-center justify-center rounded-lg bg-primary/10 font-mono text-sm text-primary">
                  0{index + 1}
                </div>
                <CardTitle>{capability.title}</CardTitle>
                <CardDescription className="leading-relaxed">
                  {capability.description}
                </CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border bg-card p-6 sm:p-10">
        <div className="grid gap-8 md:grid-cols-[1fr_auto] md:items-center">
          <div className="space-y-3">
            <McpIcon className="size-9 text-primary" />
            <h2 className="text-2xl font-semibold tracking-tight">
              MCP is the product. REST is the escape hatch.
            </h2>
            <p className="max-w-2xl text-muted-foreground">
              Most people should connect Better Fetch directly to their AI.
              Developers can still use the same engine through the versioned API,
              with the same keys, sessions, metering, and fetch outcomes.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Button asChild>
              <Link href="/mcp">Connect your AI</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/docs">Use the REST API</Link>
            </Button>
          </div>
        </div>
      </section>

      <section id="pricing" className="space-y-6">
        <div className="space-y-1 text-center">
          <h2 className="text-3xl font-semibold tracking-tight">Start with 50 free calls</h2>
          <p className="text-sm text-muted-foreground">
            No card required. Upgrade when your agents need more retrieval capacity.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {(Object.keys(PLANS) as Tier[]).map((tier) => (
            <Card
              key={tier}
              className={tier === "pro" ? "border-primary/40 shadow-md" : ""}
            >
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>{PLANS[tier].name}</CardTitle>
                  {tier === "pro" ? <Badge>Popular</Badge> : null}
                </div>
                <CardDescription>
                  <span className="text-2xl font-semibold text-foreground">
                    ${PLANS[tier].usd}
                  </span>{" "}
                  / month
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1">
                <ul className="space-y-2 text-sm">
                  {FEATURES[tier].map((feature) => (
                    <li key={feature} className="flex items-center gap-2">
                      <CheckIcon className="size-4 shrink-0 text-primary" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter>
                {tier === "free" ? (
                  <Button className="w-full" variant="outline" asChild>
                    <Link href={signedIn ? "/keys" : "/login"}>
                      {signedIn ? "Open dashboard" : "Start free"}
                    </Link>
                  </Button>
                ) : signedIn ? (
                  <form action="/api/checkout" method="post" className="w-full">
                    <input type="hidden" name="tier" value={tier} />
                    <Button
                      type="submit"
                      className="w-full"
                      variant={tier === "pro" ? "default" : "outline"}
                    >
                      Subscribe
                    </Button>
                  </form>
                ) : (
                  <Button
                    className="w-full"
                    variant={tier === "pro" ? "default" : "outline"}
                    asChild
                  >
                    <Link href="/login">Start free first</Link>
                  </Button>
                )}
              </CardFooter>
            </Card>
          ))}
        </div>
        <p className="text-center text-xs text-muted-foreground">
          An accepted engine call consumes one credit. Multi-step tools show their estimated credit cost before they run.
        </p>
      </section>
    </div>
  );
}
