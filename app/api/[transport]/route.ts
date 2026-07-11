import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { Implementation } from "@modelcontextprotocol/sdk/types.js";
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { z } from "zod";
import { sha256Hex } from "@/lib/keys";
import { MCP_TOOL_DESCRIPTIONS } from "@/lib/mcp-tools";
import { OAUTH_SCOPE } from "@/lib/oauth";
import { runTool } from "@/lib/runner-client";
import { categoryLabel, compareTools, toolMetaDescription } from "@/lib/tool-display";
import { getLiveTool, getLiveTools } from "@/lib/tools-registry";
import { isTier, PLANS } from "@/lib/plans";
import { createAdminClient } from "@/lib/supabase/admin";
import { effectivePeriod } from "@/lib/usage";

// Remote MCP server (Streamable HTTP) at /api/mcp — the endpoint users add
// to Claude, ChatGPT desktop, Codex, or any spec-compliant MCP client. Auth
// accepts any live `bf_` API key: OAuth-issued access tokens ARE api_keys
// rows, and a hand-pasted key from /keys works identically. Browser fetch
// tools are forwarded to the Python backend with that key, so validation,
// plan checks, and usage metering happen exactly as for the REST API.

const API_BASE = process.env.BETTER_FETCH_API_URL ?? "https://api.betterfetch.co";
const SITE_BASE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://betterfetch.co";

const COUNTRY = z
  .string()
  .length(2)
  .optional()
  .describe("Two-letter country code for browser locale/timezone defaults (e.g. 'us', 'de'); does not change egress IP");
const SESSION = z
  .string()
  .max(64)
  .optional()
  .describe("Account-scoped sticky session id: requests sharing it reuse the same browser profile, fingerprint, cookies, and localStorage");
const WAIT_UNTIL = z
  .enum(["load", "domcontentloaded", "networkidle", "commit"])
  .optional()
  .describe("Navigation wait condition (default 'load')");
const WAIT_SELECTOR = z
  .string()
  .optional()
  .describe("CSS selector to wait for before capturing");
const WAIT_MS = z
  .number()
  .int()
  .min(0)
  .max(30_000)
  .optional()
  .describe("Extra milliseconds to wait after load");
const TIMEOUT_MS = z
  .number()
  .int()
  .min(1)
  .max(240_000)
  .optional()
  .describe("Navigation and selector timeout in milliseconds (default 90000, max 240000)");
const STRATEGY = z
  .enum(["auto", "http", "browser"])
  .optional()
  .describe("Execution strategy: auto, http, or browser (default auto)");
const PROXY = z
  .enum(["none", "auto", "residential"])
  .optional()
  .describe(
    "Network routing: none (default), auto (direct first, residential only after a block), or residential (proxy every attempt; use only when necessary)",
  );
const CACHE_TTL_MS = z
  .number()
  .int()
  .min(0)
  .max(60_000)
  .optional()
  .describe("Short-lived response cache TTL for identical synchronous fetch payloads, in milliseconds");
const EXTRA_HEADERS = z
  .record(z.string(), z.string())
  .optional()
  .describe("Extra HTTP request headers to send, e.g. a Referer or auth header the target requires");

type FetchPayload = Record<string, unknown>;
type BetterFetchApiResult = {
  ok?: boolean;
  error?: string;
  message?: string;
  reason?: string;
  status?: number;
  final_url?: string;
  title?: string;
  blocked?: boolean;
  block_reason?: string;
  attempts?: number;
  headers?: Record<string, string>;
  html?: string | null;
  body_text?: string | null;
  body_bytes?: number;
  body_truncated?: boolean;
  content_type?: string;
  content_kind?: string;
  cache_status?: string;
  json_parse_ok?: boolean;
  json?: unknown;
  screenshot_b64?: string | null;
  transport?: string;
  timing_ms?: number;
  proxy_used?: boolean;
  network?: unknown[];
  network_streams?: unknown[];
  cf_clearance?: string | null;
  cf_clearance_cookie?: unknown;
  cf_clearance_session?: string | null;
  datadome_detected?: boolean;
  datadome_cookie?: string | null;
  datadome_cookie_detail?: unknown;
  datadome_session?: string | null;
  [key: string]: unknown;
};

async function callFetchApi(token: string, payload: FetchPayload) {
  const response = await fetch(`${API_BASE}/v1/fetch`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(260_000),
  });
  return parseApiJson(response, "fetch_failed");
}

async function deleteSessionViaFetchApi(token: string, id: string) {
  const response = await fetch(`${API_BASE}/v1/sessions/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    signal: AbortSignal.timeout(30_000),
  });
  return parseApiJson(response, "fetch_failed");
}

async function parseApiJson(
  response: Response,
  fallbackCode: string,
): Promise<BetterFetchApiResult> {
  const text = await response.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    return {
      ok: false,
      error: fallbackCode,
      message: `Better Fetch returned ${response.status} ${response.statusText || "non-JSON response"}`,
      status: response.status,
    };
  }
  if (!response.ok && typeof parsed === "object" && parsed !== null && !("ok" in parsed)) {
    return {
      ok: false,
      error: fallbackCode,
      message:
        (parsed as { message?: string }).message ??
        (parsed as { reason?: string }).reason ??
        `Better Fetch returned ${response.status}`,
      status: response.status,
    };
  }
  return parsed as BetterFetchApiResult;
}

function toolError(result: { error?: string; message?: string }) {
  const hints: Record<string, string> = {
    payment_required:
      "The connected Better Fetch account has no active plan — pick one at https://betterfetch.co/keys.",
    quota_exceeded:
      "Monthly quota exhausted — upgrade at https://betterfetch.co/keys or wait for the period to reset.",
    session_limit_exceeded:
      "Stored browser session limit reached — clear a session at https://betterfetch.co/keys or upgrade.",
    unauthorized:
      "The key for this connection was revoked — reconnect the Better Fetch connector.",
  };
  const code = result.error ?? "fetch_failed";
  const text = `${code}: ${result.message ?? "request failed"}${
    hints[code] ? ` ${hints[code]}` : ""
  }`;
  return { content: [{ type: "text" as const, text }], isError: true };
}

function asText(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

const handler = createMcpHandler(
  async (server) => {
    // Keep the default tool surface compact. The catalogue can grow without
    // forcing every MCP client to reason over dozens of specialist schemas on
    // every request: agents search the registry, then invoke one exact tool.
    server.registerTool(
      "search_tools",
      {
        title: "Search Better Fetch tools",
        description:
          "Search the live Better Fetch catalogue for a ready-made scraper or extractor before assembling a workflow from lower-level tools.",
        inputSchema: {
          query: z
            .string()
            .max(120)
            .optional()
            .describe("What data or site capability is needed, e.g. 'Google Maps leads'"),
          category: z
            .string()
            .max(64)
            .optional()
            .describe("Optional exact category slug returned by a previous search"),
          limit: z.number().int().min(1).max(20).optional().describe("Maximum matches (default 8)"),
        },
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      async (args) => {
        const query = args.query?.trim().toLowerCase() ?? "";
        const terms = query.split(/\s+/).filter(Boolean);
        const tools = (await getLiveTools())
          .filter((tool) => !args.category || tool.category === args.category)
          .map((tool) => {
            const haystack = [
              tool.name,
              tool.title,
              tool.description,
              tool.seo?.keywords.join(" ") ?? "",
              categoryLabel(tool.category),
            ]
              .join(" ")
              .toLowerCase();
            return {
              tool,
              matches: terms.reduce((score, term) => score + (haystack.includes(term) ? 1 : 0), 0),
            };
          })
          .filter(({ matches }) => terms.length === 0 || matches > 0)
          .sort((a, b) => b.matches - a.matches || compareTools(a.tool, b.tool))
          .slice(0, args.limit ?? 8)
          .map(({ tool }) => ({
            name: tool.name,
            title: tool.title,
            description: toolMetaDescription(tool),
            category: tool.category,
            category_label: categoryLabel(tool.category),
            credits_estimate: tool.credits_estimate,
            input_schema: tool.input_schema,
            examples: tool.examples,
          }));
        return asText({ matches: tools, count: tools.length });
      },
    );

    server.registerTool(
      "run_tool",
      {
        title: "Run a Better Fetch tool",
        description:
          "Run one exact ready-made tool returned by search_tools. Review its input schema and estimated credits before calling.",
        inputSchema: {
          name: z.string().min(2).max(100).describe("Exact tool name returned by search_tools"),
          input: z.record(z.string(), z.unknown()).describe("Input matching the tool's input_schema"),
        },
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: true,
        },
      },
      async (args, extra) => {
        const tool = await getLiveTool(args.name);
        if (!tool) {
          return toolError({
            error: "tool_not_found",
            message: `No live Better Fetch tool named ${args.name}. Call search_tools first.`,
          });
        }
        const result = await runTool(tool.name, args.input, extra.authInfo!.token);
        if (result.ok === false) return toolError(result);
        return asText({
          tool: tool.name,
          credits_estimate: tool.credits_estimate,
          output: result.output,
        });
      },
    );

    server.registerTool(
      "fetch_url",
      {
        title: "Fetch URL",
        description: MCP_TOOL_DESCRIPTIONS.fetch_url,
        inputSchema: {
          url: z.string().url().describe("The URL to fetch"),
          format: z
            .enum(["html", "text"])
            .optional()
            .describe("Return raw HTML or extracted body text (default 'text')"),
          wait_until: WAIT_UNTIL,
          wait_selector: WAIT_SELECTOR,
          wait_ms: WAIT_MS,
          timeout_ms: TIMEOUT_MS,
          strategy: STRATEGY,
          proxy: PROXY,
          cache_ttl_ms: CACHE_TTL_MS,
          country: COUNTRY,
          session: SESSION,
          extra_headers: EXTRA_HEADERS,
          locale: z
            .string()
            .max(64)
            .optional()
            .describe("Browser locale, e.g. 'fr-FR' (overrides the country-derived default)"),
          timezone: z
            .string()
            .max(64)
            .optional()
            .describe("IANA browser timezone, e.g. 'Europe/Paris' (overrides the country-derived default)"),
          user_agent: z.string().max(512).optional().describe("Override the browser's User-Agent"),
          humanize: z
            .boolean()
            .optional()
            .describe("Simulate human mouse/scroll behavior before capture (default true for page fetches)"),
          max_chars: z
            .number()
            .int()
            .min(1000)
            .max(500_000)
            .optional()
            .describe("Truncate the returned content to this many characters (default 60000)"),
        },
      },
      async (args, extra) => {
        const result = await callFetchApi(extra.authInfo!.token, {
          url: args.url,
          wait_until: args.wait_until,
          wait_selector: args.wait_selector,
          wait_ms: args.wait_ms,
          timeout_ms: args.timeout_ms,
          strategy: args.strategy,
          proxy: args.proxy,
          cache_ttl_ms: args.cache_ttl_ms,
          country: args.country,
          session: args.session,
          extra_headers: args.extra_headers,
          locale: args.locale,
          timezone: args.timezone,
          user_agent: args.user_agent,
          humanize: args.humanize,
          return_response_text: args.format !== "html" ? true : undefined,
        });
        if (result.ok === false) return toolError(result);
        const limit = args.max_chars ?? 60_000;
        const raw = (args.format === "html" ? result.html : result.body_text) ?? "";
        return asText({
          status: result.status,
          final_url: result.final_url,
          title: result.title,
          blocked: result.blocked,
          block_reason: result.block_reason,
          attempts: result.attempts,
          transport: result.transport,
          timing_ms: result.timing_ms,
          proxy_used: result.proxy_used,
          cache_status: result.cache_status,
          content_type: result.content_type,
          content_kind: result.content_kind,
          body_bytes: result.body_bytes,
          body_truncated: result.body_truncated,
          headers: result.headers,
          content: raw.slice(0, limit),
          content_truncated: raw.length > limit,
        });
      },
    );

    server.registerTool(
      "scrape_json",
      {
        title: "Scrape JSON API",
        description: MCP_TOOL_DESCRIPTIONS.scrape_json,
        inputSchema: {
          url: z.string().url().describe("The JSON endpoint to fetch"),
          timeout_ms: TIMEOUT_MS,
          strategy: STRATEGY,
          proxy: PROXY,
          cache_ttl_ms: CACHE_TTL_MS,
          country: COUNTRY,
          session: SESSION,
          extra_headers: EXTRA_HEADERS,
        },
      },
      async (args, extra) => {
        const result = await callFetchApi(extra.authInfo!.token, {
          url: args.url,
          timeout_ms: args.timeout_ms,
          strategy: args.strategy,
          proxy: args.proxy,
          cache_ttl_ms: args.cache_ttl_ms,
          country: args.country,
          session: args.session,
          return_response_text: true,
          include_html: false,
          extra_headers: { Accept: "application/json", ...(args.extra_headers ?? {}) },
        });
        if (result.ok === false) return toolError(result);
        return asText({
          status: result.status,
          final_url: result.final_url,
          blocked: result.blocked,
          block_reason: result.block_reason,
          attempts: result.attempts,
          transport: result.transport,
          timing_ms: result.timing_ms,
          proxy_used: result.proxy_used,
          cache_status: result.cache_status,
          content_type: result.content_type,
          content_kind: result.content_kind,
          json_parse_ok: result.json_parse_ok,
          body_bytes: result.body_bytes,
          body_truncated: result.body_truncated,
          json: result.json ?? null,
          body_text: result.json_parse_ok ? undefined : result.body_text?.slice(0, 60_000),
        });
      },
    );

    server.registerTool(
      "screenshot_url",
      {
        title: "Screenshot URL",
        description: MCP_TOOL_DESCRIPTIONS.screenshot_url,
        inputSchema: {
          url: z.string().url().describe("The URL to screenshot"),
          full_page: z.boolean().optional().describe("Capture the full page, not just the viewport"),
          wait_until: WAIT_UNTIL,
          wait_selector: WAIT_SELECTOR,
          wait_ms: WAIT_MS,
          timeout_ms: TIMEOUT_MS,
          proxy: PROXY,
          country: COUNTRY,
          session: SESSION,
        },
      },
      async (args, extra) => {
        const result = await callFetchApi(extra.authInfo!.token, {
          url: args.url,
          screenshot: true,
          full_page: args.full_page,
          wait_until: args.wait_until,
          wait_selector: args.wait_selector,
          wait_ms: args.wait_ms,
          timeout_ms: args.timeout_ms,
          proxy: args.proxy,
          country: args.country,
          session: args.session,
        });
        if (result.ok === false) return toolError(result);
        if (!result.screenshot_b64) {
          return toolError({ error: "fetch_failed", message: "no screenshot captured" });
        }
        return {
          content: [
            {
              type: "image" as const,
              data: result.screenshot_b64,
              mimeType: "image/png",
            },
            {
              type: "text" as const,
              text: JSON.stringify({
                status: result.status,
                final_url: result.final_url,
                title: result.title,
              }),
            },
          ],
        };
      },
    );

    server.registerTool(
      "discover_apis",
      {
        title: "Discover APIs",
        description: MCP_TOOL_DESCRIPTIONS.discover_apis,
        inputSchema: {
          url: z.string().url().describe("The page to inspect"),
          wait_ms: z
            .number()
            .int()
            .min(0)
            .max(30_000)
            .optional()
            .describe("Extra milliseconds to wait so late XHR calls are captured"),
          timeout_ms: TIMEOUT_MS,
          proxy: PROXY,
          country: COUNTRY,
          session: SESSION,
          include_bodies: z
            .boolean()
            .optional()
            .describe(
              "Include a preview of each response body so you can see which endpoint carries the data",
            ),
          include_streams: z
            .boolean()
            .optional()
            .describe(
              "Include streamed fetch/XHR chunks, EventSource messages, and WebSocket messages observed while the page is open",
            ),
        },
      },
      async (args, extra) => {
        const includeBodies = args.include_bodies ?? false;
        const includeStreams = args.include_streams ?? false;
        const result = await callFetchApi(extra.authInfo!.token, {
          url: args.url,
          wait_ms: args.wait_ms ?? 3000,
          timeout_ms: args.timeout_ms,
          proxy: args.proxy,
          country: args.country,
          session: args.session,
          capture_network: true,
          network_resource_types: includeStreams
            ? ["xhr", "fetch", "eventsource", "websocket"]
            : ["xhr", "fetch"],
          network_include_bodies: includeBodies,
          network_capture_streams: includeStreams,
          // Previews exist to identify the right endpoint, not to deliver the
          // payload (that's scrape_json) — keep capture small so 100 calls
          // can't flood the model's context.
          ...(includeBodies ? { network_max_body_bytes: 16_384 } : {}),
          ...(includeStreams
            ? {
                network_stream_max_events: 50,
                network_stream_max_value_bytes: 16_384,
              }
            : {}),
        });
        if (result.ok === false) return toolError(result);
        type NetworkEvent = {
          method?: string;
          url?: string;
          status?: number;
          resource_type?: string;
          timing_ms?: number;
          json?: unknown;
          json_parse_ok?: boolean;
          body_text?: string;
        };
        type NetworkStreamEvent = {
          source?: string | null;
          url?: string | null;
          status?: number | null;
          event_type?: string | null;
          direction?: string | null;
          value_text?: string | null;
          value_base64?: string | null;
          value_truncated?: boolean;
          json?: unknown;
          json_parse_ok?: boolean;
        };
        const calls = ((result.network ?? []) as NetworkEvent[]).map((e) => {
          const raw = e.json !== null && e.json !== undefined ? JSON.stringify(e.json) : e.body_text;
          return {
            method: e.method,
            url: e.url,
            status: e.status,
            resource_type: e.resource_type,
            timing_ms: e.timing_ms,
            ...(includeBodies
              ? {
                  is_json: e.json_parse_ok ?? false,
                  body_preview: raw?.slice(0, 4000),
                  body_preview_truncated: (raw?.length ?? 0) > 4000,
                }
              : {}),
          };
        });
        const streamValues = ((result.network_streams ?? []) as NetworkStreamEvent[]).map((e) => {
          const raw =
            e.json !== null && e.json !== undefined ? JSON.stringify(e.json) : e.value_text;
          return {
            source: e.source,
            url: e.url,
            status: e.status,
            event_type: e.event_type,
            direction: e.direction,
            is_json: e.json_parse_ok ?? false,
            value_preview: raw?.slice(0, 4000) ?? null,
            value_preview_truncated:
              Boolean(e.value_truncated) || (raw?.length ?? 0) > 4000,
            value_base64: e.value_base64 ?? null,
          };
        });
        return asText({
          page: result.final_url,
          title: result.title,
          proxy_used: result.proxy_used,
          api_calls: calls,
          ...(includeStreams ? { stream_values: streamValues } : {}),
        });
      },
    );

    server.registerTool(
      "get_clearance",
      {
        title: "Get Cloudflare clearance",
        description: MCP_TOOL_DESCRIPTIONS.get_clearance,
        inputSchema: {
          url: z.string().url().describe("A URL on the Cloudflare-protected site"),
          timeout_ms: TIMEOUT_MS,
          proxy: PROXY,
          country: COUNTRY,
          session: SESSION,
        },
      },
      async (args, extra) => {
        const result = await callFetchApi(extra.authInfo!.token, {
          url: args.url,
          timeout_ms: args.timeout_ms,
          proxy: args.proxy,
          country: args.country,
          session: args.session,
          return_cf_clearance: true,
        });
        if (result.ok === false) return toolError(result);
        return asText({
          status: result.status,
          final_url: result.final_url,
          proxy_used: result.proxy_used,
          cf_clearance: result.cf_clearance ?? null,
          cf_clearance_cookie: result.cf_clearance_cookie ?? null,
          session: result.cf_clearance_session ?? null,
        });
      },
    );

    server.registerTool(
      "get_datadome_cookie",
      {
        title: "Get DataDome cookie",
        description: MCP_TOOL_DESCRIPTIONS.get_datadome_cookie,
        inputSchema: {
          url: z.string().url().describe("A URL on the DataDome-protected site"),
          timeout_ms: TIMEOUT_MS,
          proxy: PROXY,
          country: COUNTRY,
          session: SESSION,
        },
      },
      async (args, extra) => {
        const result = await callFetchApi(extra.authInfo!.token, {
          url: args.url,
          timeout_ms: args.timeout_ms,
          proxy: args.proxy,
          country: args.country,
          session: args.session,
          return_datadome_cookie: true,
        });
        if (result.ok === false) return toolError(result);
        return asText({
          status: result.status,
          final_url: result.final_url,
          blocked: result.blocked,
          attempts: result.attempts,
          proxy_used: result.proxy_used,
          datadome_detected: result.datadome_detected ?? false,
          datadome_cookie: result.datadome_cookie ?? null,
          datadome_cookie_detail: result.datadome_cookie_detail ?? null,
          session: result.datadome_session ?? null,
        });
      },
    );

    server.registerTool(
      "get_usage",
      {
        title: "Get plan usage",
        description: MCP_TOOL_DESCRIPTIONS.get_usage,
        inputSchema: {},
      },
      async (_args, extra) => {
        const userId = (extra.authInfo!.extra as { userId: string }).userId;
        const admin = createAdminClient();
        const { data: sub } = await admin
          .from("subscriptions")
          .select(
            "tier, status, monthly_quota, session_limit, session_idle_ttl_days, stripe_subscription_id, current_period_start, current_period_end",
          )
          .eq("user_id", userId)
          .in("status", ["active", "trialing", "past_due"])
          .limit(1)
          .maybeSingle();
        if (!sub) {
          return asText({
            plan: null,
            message:
              "No active subscription on this account — pick a plan at https://betterfetch.co/#pricing",
          });
        }
        const period = effectivePeriod(sub);
        let calls = 0;
        if (period) {
          const { data: usage } = await admin
            .from("usage_counters")
            .select("calls")
            .eq("user_id", userId)
            .eq("period_start", period.start.toISOString())
            .maybeSingle();
          calls = usage?.calls ?? 0;
        }
        const { count: sessionsUsed } = await admin
          .from("browser_sessions")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .is("revoked_at", null)
          .is("deleted_at", null)
          .gt("expires_at", new Date().toISOString());
        return asText({
          plan: sub.tier && isTier(sub.tier) ? PLANS[sub.tier].name : sub.tier,
          status: sub.status,
          calls_used: calls,
          monthly_quota: sub.monthly_quota,
          remaining: Math.max(0, sub.monthly_quota - calls),
          sessions_used: sessionsUsed ?? 0,
          session_limit:
            sub.session_limit ??
            (sub.tier && isTier(sub.tier) ? PLANS[sub.tier].sessionLimit : 0),
          session_idle_ttl_days:
            sub.session_idle_ttl_days ??
            (sub.tier && isTier(sub.tier) ? PLANS[sub.tier].sessionIdleTtlDays : 7),
          period_ends: period?.end?.toISOString() ?? sub.current_period_end,
        });
      },
    );

    server.registerTool(
      "list_sessions",
      {
        title: "List browser sessions",
        description: MCP_TOOL_DESCRIPTIONS.list_sessions,
        inputSchema: {},
      },
      async (_args, extra) => {
        const userId = (extra.authInfo!.extra as { userId: string }).userId;
        const admin = createAdminClient();
        const { data } = await admin
          .from("browser_sessions")
          .select(
            "id, session_name, country, context_key, created_at, last_used_at, expires_at, snapshot_updated_at, snapshot_bytes",
          )
          .eq("user_id", userId)
          .is("revoked_at", null)
          .is("deleted_at", null)
          .gt("expires_at", new Date().toISOString())
          .order("last_used_at", { ascending: false });
        return asText({ sessions: data ?? [] });
      },
    );

    server.registerTool(
      "clear_session",
      {
        title: "Clear browser session",
        description: MCP_TOOL_DESCRIPTIONS.clear_session,
        inputSchema: {
          id: z.string().uuid().describe("Session id from list_sessions"),
        },
      },
      async (args, extra) => {
        const result = await deleteSessionViaFetchApi(extra.authInfo!.token, args.id);
        if (result.ok === false) return toolError(result);
        return asText({ ok: true, id: args.id });
      },
    );
  },
  {
    // icons/websiteUrl flow into the initialize response so MCP clients
    // (Claude, Cowork) can show our logo next to the connector. mcp-handler
    // types serverInfo as bare {name, version} but hands it verbatim to
    // McpServer, which accepts the spec's full Implementation — hence the
    // satisfies + cast.
    instructions:
      "Better Fetch is the web data layer for AI agents. Use it only for public or authorized web retrieval. Start with fetch_url strategy=auto; prefer scrape_json or discover_apis when structured data is available. Reuse a stable session for multi-step work. Use proxy=auto only after direct access is blocked or regional egress is required, and residential only when explicitly necessary. Search the catalogue before run_tool. Each accepted engine call consumes credits: avoid blind retries and report blocked, block_reason, attempts, and proxy_used.",
    serverInfo: {
      name: "better-fetch",
      title: "Better Fetch",
      version: "2.0.0",
      websiteUrl: SITE_BASE,
      icons: [
        {
          src: `${SITE_BASE}/icon-192.png`,
          mimeType: "image/png",
          sizes: ["192x192"],
        },
        {
          src: `${SITE_BASE}/icon-512.png`,
          mimeType: "image/png",
          sizes: ["512x512"],
        },
      ],
    } satisfies Implementation as { name: string; version: string },
  },
  {
    basePath: "/api", // endpoint: /api/mcp
    maxDuration: 260,
    disableSse: true, // SSE transport needs Redis; Streamable HTTP covers modern clients
  },
);

// Any live bf_ key authenticates. OAuth-issued keys additionally carry an
// expiry on their grant: past it we 401 so the client refreshes; revocation
// (either side) kills both paths. The backend re-validates and meters every
// forwarded call regardless, so this gate is about returning clean OAuth
// 401s, not about being the last line of defense.
const verifyToken = async (
  _req: Request,
  bearerToken?: string,
): Promise<AuthInfo | undefined> => {
  if (!bearerToken?.startsWith("bf_")) return undefined;

  const admin = createAdminClient();
  const { data: key } = await admin
    .from("api_keys")
    .select(
      "id, user_id, revoked_at, oauth_grants!api_key_id(client_id, scope, access_expires_at, revoked_at)",
    )
    .eq("key_hash", sha256Hex(bearerToken))
    .maybeSingle();
  if (!key || key.revoked_at) return undefined;

  const grant = (key.oauth_grants ?? [])[0];
  if (grant) {
    if (grant.revoked_at) return undefined;
    if (new Date(grant.access_expires_at).getTime() < Date.now()) return undefined;
  }

  return {
    token: bearerToken,
    clientId: grant?.client_id ?? "api-key",
    scopes: [grant?.scope ?? OAUTH_SCOPE],
    extra: { userId: key.user_id },
  };
};

const authHandler = withMcpAuth(handler, verifyToken, {
  required: true,
  resourceMetadataPath: "/.well-known/oauth-protected-resource",
});

export { authHandler as GET, authHandler as POST, authHandler as DELETE };
