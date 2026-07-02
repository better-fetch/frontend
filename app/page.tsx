import Link from "next/link";
import { redirect } from "next/navigation";
import { CodeTabs } from "@/components/code-tabs";
import { CheckIcon, McpIcon, PluginIcon } from "@/components/icons";
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

const FEATURES: Record<Tier, string[]> = {
  free: ["50 calls/mo", "1 stored browser session", "No charge — card on file"],
  starter: ["25,000 calls/mo", "10 stored browser sessions", "Screenshots"],
  pro: [
    "100,000 calls/mo",
    "Everything in Starter",
    "Regional routing",
    "50 stored browser sessions",
  ],
  scale: [
    "500,000 calls/mo",
    "Everything in Pro",
    "250 stored browser sessions",
  ],
};

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  // Supabase auth falls back to redirecting to the site root with ?code=
  // when the intended redirect URL isn't in its allow-list. Forward those
  // to the confirm handler instead of silently dropping the sign-in.
  const { code } = await searchParams;
  if (code) redirect(`/auth/confirm?code=${encodeURIComponent(code)}`);

  const signedIn = Boolean(await getClaims());

  return (
    <div className="space-y-16">
      <section className="space-y-4 pt-6 text-center">
        <h1 className="text-4xl font-semibold tracking-tight">
          Unlock the web
        </h1>
        <p className="mx-auto max-w-xl text-lg text-muted-foreground">
          JavaScript rendering, browser geo-emulation, sticky sessions,
          screenshots, and clearance-cookie collection when targets issue them —
          one API call.
        </p>
        <div className="flex justify-center gap-2 pt-2">
          <Button asChild>
            <Link href={signedIn ? "/keys" : "/login"}>
              {signedIn ? "Manage API keys" : "Get started"}
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/docs">Read the docs</Link>
          </Button>
        </div>
      </section>

      <section>
        <CodeTabs />
      </section>

      <section id="integrations" className="space-y-6">
        <div className="space-y-1 text-center">
          <h2 className="text-2xl font-semibold tracking-tight">
            Use it from your AI tools
          </h2>
          <p className="text-sm text-muted-foreground">
            Connect Better Fetch to any AI model or agent — no glue code.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="flex h-full flex-col">
            <CardHeader>
              <McpIcon className="size-8 text-primary" />
              <CardTitle>MCP connector</CardTitle>
              <CardDescription>
                A remote Model Context Protocol server so Claude, Cursor, and
                other AI clients can fetch the web as a tool — OAuth or API
                key.
              </CardDescription>
            </CardHeader>
            <CardFooter className="mt-auto">
              <Button variant="outline" asChild>
                <Link href="/mcp">Set up MCP →</Link>
              </Button>
            </CardFooter>
          </Card>
          <Card className="flex h-full flex-col">
            <CardHeader>
              <PluginIcon className="size-8 text-primary" />
              <CardTitle>Claude Code plugin</CardTitle>
              <CardDescription>
                One command installs Better Fetch skills plus the MCP connector
                into Claude Code, authed by your API key.
              </CardDescription>
            </CardHeader>
            <CardFooter className="mt-auto">
              <Button variant="outline" asChild>
                <Link href="/plugin">Install the plugin →</Link>
              </Button>
            </CardFooter>
          </Card>
        </div>
      </section>

      <section id="pricing" className="space-y-6">
        <div className="space-y-1 text-center">
          <h2 className="text-2xl font-semibold tracking-tight">Pricing</h2>
          <p className="text-sm text-muted-foreground">
            Simple monthly plans. Change or cancel anytime.
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
                  {tier === "free" ? (
                    <span className="block text-xs">
                      Card required to verify you&apos;re human
                    </span>
                  ) : null}
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
                {signedIn ? (
                  <form action="/api/checkout" method="post" className="w-full">
                    <input type="hidden" name="tier" value={tier} />
                    <Button
                      type="submit"
                      className="w-full"
                      variant={tier === "pro" ? "default" : "outline"}
                    >
                      {tier === "free" ? "Start free" : "Subscribe"}
                    </Button>
                  </form>
                ) : (
                  <Button
                    className="w-full"
                    variant={tier === "pro" ? "default" : "outline"}
                    asChild
                  >
                    <Link href="/login">Sign up</Link>
                  </Button>
                )}
              </CardFooter>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
