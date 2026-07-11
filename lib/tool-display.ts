import type { RegistryTool } from "@/lib/tools-registry";

export type ToolCategory = {
  slug: string;
  label: string;
  count: number;
  tools: RegistryTool[];
};

const CATEGORY_LABELS: Record<string, string> = {
  content: "Content extraction",
  ecommerce: "Ecommerce",
  leads: "Lead generation",
  search: "Search",
  social: "Social",
};

const LAST = Number.MAX_SAFE_INTEGER;

export function categoryLabel(slug: string): string {
  return (
    CATEGORY_LABELS[slug] ??
    slug
      .split("-")
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ")
  );
}

export function compareTools(a: RegistryTool, b: RegistryTool): number {
  const rankA = a.featured ?? a.popularity_rank ?? LAST;
  const rankB = b.featured ?? b.popularity_rank ?? LAST;
  if (rankA !== rankB) return rankA - rankB;

  const scoreA = a.popularity_score ?? -1;
  const scoreB = b.popularity_score ?? -1;
  if (scoreA !== scoreB) return scoreB - scoreA;

  return a.title.localeCompare(b.title);
}

export function getPopularTools(tools: RegistryTool[], limit = 6): RegistryTool[] {
  return [...tools].sort(compareTools).slice(0, limit);
}

export function getToolCategories(tools: RegistryTool[]): ToolCategory[] {
  const byCategory = new Map<string, RegistryTool[]>();
  for (const tool of tools) {
    const list = byCategory.get(tool.category) ?? [];
    list.push(tool);
    byCategory.set(tool.category, list);
  }

  return [...byCategory.entries()]
    .map(([slug, categoryTools]) => {
      const sortedTools = [...categoryTools].sort(compareTools);
      return {
        slug,
        label: categoryLabel(slug),
        count: sortedTools.length,
        tools: sortedTools,
      };
    })
    .sort((a, b) => {
      const topA = a.tools[0];
      const topB = b.tools[0];
      if (topA && topB) {
        const byTopTool = compareTools(topA, topB);
        if (byTopTool !== 0) return byTopTool;
      }
      return a.label.localeCompare(b.label);
    });
}

type JsonProp = {
  type?: string;
  items?: { type?: string; properties?: Record<string, unknown> };
  properties?: Record<string, unknown>;
};

// Field names a tool returns, for the card's "Returns" preview. Prefer the
// item fields of the primary results array (most informative) over the
// top-level envelope. Note: output_schema is stored as jsonb, which does not
// preserve manifest key order — so we can't trust insertion order and instead
// surface headline fields first and drop noise (echo keys, coordinates, ids).
const ECHO_FIELDS = new Set(["query", "count", "ok", "results", "places", "items"]);
const NOISE_FIELDS = new Set([
  "lat",
  "lng",
  "latitude",
  "longitude",
  "id",
  "uuid",
  "index",
]);
// Fields worth leading with, most compelling first.
const HEADLINE_ORDER = [
  "name",
  "title",
  "rating",
  "reviews",
  "price",
  "phone",
  "website",
  "email",
  "address",
  "url",
  "snippet",
  "text",
  "author",
  "byline",
  "category",
];

export function toolOutputFields(tool: RegistryTool, limit = 5): string[] {
  const props = (tool.output_schema?.properties ?? {}) as Record<string, JsonProp>;
  const entries = Object.entries(props);

  const arrayOfObjects = entries.find(
    ([, p]) => p?.type === "array" && p.items?.type === "object" && p.items.properties,
  );
  const source = arrayOfObjects
    ? Object.keys(arrayOfObjects[1].items!.properties!)
    : entries.map(([name]) => name);

  const rank = (name: string) => {
    const i = HEADLINE_ORDER.indexOf(name);
    return i === -1 ? HEADLINE_ORDER.length : i;
  };
  return source
    .filter((name) => !ECHO_FIELDS.has(name) && !NOISE_FIELDS.has(name))
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
    .slice(0, limit);
}

// A concrete, human-readable value from the tool's first example, for the
// card's "Example" chip — the query, the URL, or the first string input.
export function toolExampleValue(tool: RegistryTool): string | null {
  const input = tool.examples?.[0]?.input;
  if (!input || typeof input !== "object") return null;
  const record = input as Record<string, unknown>;
  const preferred = record.query ?? record.url ?? record.q ?? record.term;
  const value =
    typeof preferred === "string"
      ? preferred
      : Object.values(record).find((v) => typeof v === "string");
  if (typeof value !== "string") return null;
  return value.length > 48 ? `${value.slice(0, 47)}…` : value;
}

export function toolMetaDescription(tool: RegistryTool): string {
  return tool.seo?.description ?? tool.description;
}

export function toolPageTitle(tool: RegistryTool): string {
  return tool.seo?.title ?? tool.title;
}
