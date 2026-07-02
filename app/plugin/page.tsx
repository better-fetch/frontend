import type { Metadata } from "next";
import Link from "next/link";
import { CopyButton } from "@/components/copy-button";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Claude Code plugin",
  description:
    "Install the Better Fetch plugin for Claude Code: skills for page fetching, structured extraction, crawling, API discovery, screenshots, and bot-wall bypass, plus a scraper subagent and the MCP connector — added with one command.",
  alternates: { canonical: "/plugin" },
};

const INSTALL = `/plugin marketplace add better-fetch/claude-plugins
/plugin install better-fetch@better-fetch`;

const REPO = "https://github.com/better-fetch/claude-plugins";
const SKILLS_BASE = `${REPO}/blob/main/plugins/better-fetch/skills`;

const SKILLS: { name: string; desc: string }[] = [
  { name: "extract-structured-data", desc: "End-to-end: find a page's data API and pull clean JSON, falling back to rendered HTML." },
  { name: "fetch-page", desc: "Render JavaScript pages; sticky sessions, custom headers, country locale/timezone defaults, and fingerprint control." },
  { name: "scrape-json-api", desc: "Pull JSON from APIs behind bot protection or geo-fences, with the headers they require." },
  { name: "discover-apis", desc: "Capture a page's network calls — with response previews — to find its internal APIs." },
  { name: "crawl-pages", desc: "Multi-page crawls: pagination, sitemaps, sticky sessions, polite pacing." },
  { name: "screenshot-page", desc: "Capture full-page or viewport screenshots." },
  { name: "bypass-bot-walls", desc: "Attempt Cloudflare and bot-wall flows; collect cf_clearance tokens when issued." },
  { name: "webfetch-fallback", desc: "Escalate automatically when a plain fetch comes back blocked, empty, or geo-walled." },
  { name: "usage", desc: "Check your plan, calls used, remaining quota, and stored browser session usage." },
];

function CodeBlock({ children }: { children: string }) {
  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded-lg border bg-muted/50 p-4 pr-12 font-mono text-xs leading-relaxed">
        {children}
      </pre>
      <div className="absolute right-2 top-2">
        <CopyButton value={children} />
      </div>
    </div>
  );
}

export default function PluginPage() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">
          Claude Code plugin
        </h1>
        <p className="text-muted-foreground">
          One command adds Better Fetch to Claude Code: nine skills and a
          scraper subagent that teach the agent to fetch the web well, plus the{" "}
          <Link href="/mcp" className="underline">
            MCP connector
          </Link>{" "}
          wired up and ready.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Install</CardTitle>
          <CardDescription>
            Run these in Claude Code. You&apos;ll be prompted for your API key
            once — it&apos;s stored securely and used to authenticate the
            connector.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <CodeBlock>{INSTALL}</CodeBlock>
          <p className="text-sm text-muted-foreground">
            No key yet?{" "}
            <Link href="/keys" className="underline">
              Create one
            </Link>
            . The plugin source is public on{" "}
            <a href={REPO} className="underline" rel="noopener">
              GitHub
            </a>
            .
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>What you get</CardTitle>
          <CardDescription>
            Skills auto-activate when relevant; the <code className="font-mono">
              better-fetch
            </code>{" "}
            MCP tools are available to call directly.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-3 text-sm">
            {SKILLS.map((s) => (
              <li key={s.name}>
                <a
                  href={`${SKILLS_BASE}/${s.name}/SKILL.md`}
                  className="font-mono font-medium underline-offset-4 hover:underline"
                  rel="noopener"
                >
                  {s.name}
                </a>
                <span className="text-muted-foreground"> — {s.desc}</span>
              </li>
            ))}
            <li>
              <a
                href={`${REPO}/blob/main/plugins/better-fetch/agents/web-scraper.md`}
                className="font-mono font-medium underline-offset-4 hover:underline"
                rel="noopener"
              >
                web-scraper
              </a>
              <span className="text-muted-foreground">
                {" "}
                — agent: runs crawls and extraction in its own context, returns
                only the extracted data.
              </span>
            </li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Also in the marketplace: site QA</CardTitle>
          <CardDescription>
            For your <em>own</em> site rather than scraping:{" "}
            <a
              href={`${REPO}/tree/main/plugins/better-fetch-site-qa`}
              className="underline"
              rel="noopener"
            >
              better-fetch-site-qa
            </a>{" "}
            adds <code className="font-mono">geo-check</code> (view your site
            from any country), <code className="font-mono">seo-render-check</code>{" "}
            (what crawlers see vs users), and{" "}
            <code className="font-mono">monitor-page-changes</code>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CodeBlock>{`/plugin install better-fetch-site-qa@better-fetch`}</CodeBlock>
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button asChild>
          <Link href="/mcp">Use MCP without the plugin →</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/docs">API reference</Link>
        </Button>
      </div>
    </div>
  );
}
