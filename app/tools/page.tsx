import type { Metadata } from "next";
import Link from "next/link";
import { ToolCard } from "@/components/tool-card";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  compareTools,
  getPopularTools,
  getToolCategories,
} from "@/lib/tool-display";
import { getLiveTools } from "@/lib/tools-registry";

// Below this count the storefront is a single grid; a separate "Popular"
// strip only earns its place once there are enough tools to scroll past.
const POPULAR_STRIP_THRESHOLD = 9;

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Tools",
  description:
    "Ready-made web tools for Claude, ChatGPT, Codex, and other agents. Discover them over MCP, call them through REST, or run them locally.",
  alternates: { canonical: "/tools" },
};

export default async function ToolsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const [{ category }, tools] = await Promise.all([
    searchParams,
    getLiveTools({ force: true }),
  ]);

  const categories = getToolCategories(tools);
  const categorySlugs = new Set(categories.map((c) => c.slug));
  const active = category && categorySlugs.has(category) ? category : null;
  const visible = (active ? tools.filter((t) => t.category === active) : tools).sort(
    compareTools,
  );

  // At small catalog sizes a lone grid reads best. Once there are enough
  // tools to warrant it, lead with a popularity strip and show the rest below.
  const showPopularStrip =
    !active && tools.length >= POPULAR_STRIP_THRESHOLD;
  const popularTools = showPopularStrip ? getPopularTools(tools, 6) : [];
  const gridTools = showPopularStrip
    ? visible.filter((t) => !popularTools.some((p) => p.id === t.id))
    : visible;

  return (
    <div className="space-y-8">
      {categories.length >= 2 ? (
        <nav
          aria-label="Tool categories"
          className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0"
        >
          <Badge
            variant={active ? "outline" : "default"}
            className="h-8 rounded-full px-3 text-sm"
            asChild
          >
            <Link href="/tools" aria-current={!active ? "page" : undefined}>
              All {tools.length}
            </Link>
          </Badge>
          {categories.map((c) => (
            <Badge
              key={c.slug}
              variant={active === c.slug ? "default" : "outline"}
              className="h-8 rounded-full px-3 text-sm"
              asChild
            >
              <Link
                href={`/tools?category=${encodeURIComponent(c.slug)}`}
                aria-current={active === c.slug ? "page" : undefined}
              >
                {c.label} {c.count}
              </Link>
            </Badge>
          ))}
        </nav>
      ) : null}

      <div className="max-w-2xl space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight">Tools</h1>
        <p className="text-muted-foreground">
          Ready-made web tools built on the Better Fetch retrieval engine. Find
          and run them from{" "}
          <Link href="/mcp" className="text-foreground underline underline-offset-4">
            Claude or ChatGPT via MCP
          </Link>
          , the{" "}
          <Link href="/docs" className="text-foreground underline underline-offset-4">
            REST API
          </Link>
          , or fork and run locally — one Better Fetch account, metered per
          engine call.
        </p>
      </div>

      {showPopularStrip ? (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold tracking-tight">Most popular</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {popularTools.map((tool) => (
              <ToolCard key={tool.id} tool={tool} />
            ))}
          </div>
        </section>
      ) : null}

      {visible.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Tools are coming</CardTitle>
            <CardDescription>
              The first marketplace tools are being published now. In the
              meantime, the full fetch engine is available via the{" "}
              <Link href="/docs" className="underline">
                REST API
              </Link>{" "}
              and the{" "}
              <Link href="/mcp" className="underline">
                MCP connector
              </Link>
              .
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <section className="space-y-4">
          {showPopularStrip ? (
            <h2 className="text-lg font-semibold tracking-tight">
              {active ? "Tools" : "All tools"}
            </h2>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {gridTools.map((tool) => (
              <ToolCard key={tool.id} tool={tool} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
