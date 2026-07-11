import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { IoSchemaJson } from "@/lib/json-schema-zod";

export type ToolSeo = {
  title: string;
  description: string;
  intro: string;
  useCases: { title: string; description: string }[];
  faqs: { question: string; answer: string }[];
  keywords: string[];
};

export type RegistryTool = {
  id: string;
  name: string;
  title: string;
  description: string;
  category: string;
  logo_svg: string | null;
  logo_label: string | null;
  logo_source_url: string | null;
  seo: ToolSeo | null;
  popularity_rank: number | null;
  popularity_score: number | null;
  popularity_source: string | null;
  popularity_source_url: string | null;
  validated_at: string | null;
  benchmark: Record<string, unknown> | null;
  credits_estimate: number;
  repo_url: string;
  readme_md: string | null;
  featured: number | null;
  version: string;
  input_schema: IoSchemaJson;
  output_schema: IoSchemaJson | null;
  examples: { name: string; input: unknown }[];
};

type ToolRow = Omit<RegistryTool, "version" | "input_schema" | "output_schema" | "examples"> & {
  tool_versions: {
    version: string;
    input_schema: IoSchemaJson;
    output_schema: IoSchemaJson | null;
    examples: { name: string; input: unknown }[];
  } | null;
};

const SELECT =
  "id, name, title, description, category, logo_svg, logo_label, logo_source_url, seo, " +
  "popularity_rank, popularity_score, popularity_source, popularity_source_url, validated_at, benchmark, " +
  "credits_estimate, repo_url, readme_md, featured, " +
  "tool_versions!tools_live_version_id_fkey(version, input_schema, output_schema, examples)";

// Module-level cache: the MCP route re-registers tools on every POST and
// Fly keeps the process warm, so a short TTL turns per-request DB reads
// into one read a minute. Publishing a tool shows up within 60s.
let cache: { tools: RegistryTool[]; fetchedAt: number } | null = null;
const TTL_MS = 60_000;
const READ_TIMEOUT_MS = 5_000;

async function withRegistryTimeout<T>(query: PromiseLike<T>): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(
      () => reject(new Error("tools registry read timed out")),
      READ_TIMEOUT_MS,
    );
  });
  try {
    return await Promise.race([Promise.resolve(query), timeoutPromise]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export function clearLiveToolsCache() {
  cache = null;
}

export async function getLiveTools(opts: { force?: boolean } = {}): Promise<RegistryTool[]> {
  if (!opts.force && cache && Date.now() - cache.fetchedAt < TTL_MS) return cache.tools;

  const admin = createAdminClient();
  const query = admin
    .from("tools")
    .select(SELECT)
    .eq("status", "live")
    .not("live_version_id", "is", null)
    .order("featured", { ascending: true, nullsFirst: false })
    .order("popularity_rank", { ascending: true, nullsFirst: false })
    .order("popularity_score", { ascending: false, nullsFirst: false })
    .order("name")
    .returns<ToolRow[]>();
  let result: Awaited<typeof query>;
  try {
    result = await withRegistryTimeout(query);
  } catch (error) {
    if (cache) return cache.tools;
    throw error;
  }
  const { data, error } = result;
  if (error) {
    // Serve stale on transient failure rather than dropping all tools.
    if (cache) return cache.tools;
    throw new Error(`tools registry read failed: ${error.message}`);
  }

  const tools = (data ?? [])
    .filter((row) => row.tool_versions)
    .map(({ tool_versions, ...tool }) => ({ ...tool, ...tool_versions! }));
  cache = { tools, fetchedAt: Date.now() };
  return tools;
}

export async function getLiveTool(name: string): Promise<RegistryTool | null> {
  const tools = await getLiveTools();
  const found = tools.find((t) => t.name === name);
  if (found || !cache) return found ?? null;
  const refreshed = await getLiveTools({ force: true });
  return refreshed.find((t) => t.name === name) ?? null;
}
