import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { Implementation } from "@modelcontextprotocol/sdk/types.js";
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { z } from "zod";
import { sha256Hex } from "@/lib/keys";
import { MCP_TOOL_DESCRIPTIONS } from "@/lib/mcp-tools";
import { OAUTH_SCOPE } from "@/lib/oauth";
import { isTier, PLANS } from "@/lib/plans";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  crawlWebsiteContent,
  WEBSITE_CONTENT_CRAWLER_MCP_INPUT_SCHEMA,
} from "@/tools/website-content-crawler/runtime";
import { WEBSITE_CONTENT_CRAWLER_METADATA } from "@/tools/website-content-crawler/metadata";
import {
  extractWebsiteLogos,
  WEBSITE_LOGO_EXTRACTOR_MCP_INPUT_SCHEMA,
} from "@/tools/website-logo-extractor/runtime";
import { WEBSITE_LOGO_EXTRACTOR_METADATA } from "@/tools/website-logo-extractor/metadata";
import {
  extractSitemapUrls,
  SITEMAP_URL_EXTRACTOR_MCP_INPUT_SCHEMA,
} from "@/tools/sitemap-url-extractor/runtime";
import { SITEMAP_URL_EXTRACTOR_METADATA } from "@/tools/sitemap-url-extractor/metadata";
import {
  readRssFeeds,
  RSS_FEED_READER_MCP_INPUT_SCHEMA,
} from "@/tools/rss-feed-reader/runtime";
import { RSS_FEED_READER_METADATA } from "@/tools/rss-feed-reader/metadata";
import {
  GOOGLE_SEARCH_RESULTS_MCP_INPUT_SCHEMA,
  scrapeGoogleSearchResults,
} from "@/tools/google-search-results/runtime";
import { GOOGLE_SEARCH_RESULTS_METADATA } from "@/tools/google-search-results/metadata";
import {
  GOOGLE_MAPS_PLACES_MCP_INPUT_SCHEMA,
  scrapeGoogleMapsPlaces,
} from "@/tools/google-maps-places/runtime";
import { GOOGLE_MAPS_PLACES_METADATA } from "@/tools/google-maps-places/metadata";
import {
  AMAZON_PRODUCT_DETAILS_MCP_INPUT_SCHEMA,
  scrapeAmazonProductDetails,
} from "@/tools/amazon-product-details/runtime";
import { AMAZON_PRODUCT_DETAILS_METADATA } from "@/tools/amazon-product-details/metadata";
import {
  scrapeYoutubeVideoDetails,
  YOUTUBE_VIDEO_DETAILS_MCP_INPUT_SCHEMA,
} from "@/tools/youtube-video-details/runtime";
import { YOUTUBE_VIDEO_DETAILS_METADATA } from "@/tools/youtube-video-details/metadata";
import {
  REDDIT_POSTS_COMMENTS_MCP_INPUT_SCHEMA,
  scrapeRedditPostsComments,
} from "@/tools/reddit-posts-comments/runtime";
import { REDDIT_POSTS_COMMENTS_METADATA } from "@/tools/reddit-posts-comments/metadata";
import {
  INSTAGRAM_PROFILE_POSTS_MCP_INPUT_SCHEMA,
  scrapeInstagramProfilePosts,
} from "@/tools/instagram-profile-posts/runtime";
import { INSTAGRAM_PROFILE_POSTS_METADATA } from "@/tools/instagram-profile-posts/metadata";
import {
  scrapeTiktokProfileVideos,
  TIKTOK_PROFILE_VIDEOS_MCP_INPUT_SCHEMA,
} from "@/tools/tiktok-profile-videos/runtime";
import { TIKTOK_PROFILE_VIDEOS_METADATA } from "@/tools/tiktok-profile-videos/metadata";
import {
  META_ADS_LIBRARY_MCP_INPUT_SCHEMA,
  scrapeMetaAdsLibrary,
} from "@/tools/meta-ads-library/runtime";
import { META_ADS_LIBRARY_METADATA } from "@/tools/meta-ads-library/metadata";
import {
  scrapeXProfilePosts,
  X_PROFILE_POSTS_MCP_INPUT_SCHEMA,
} from "@/tools/x-profile-posts/runtime";
import { X_PROFILE_POSTS_METADATA } from "@/tools/x-profile-posts/metadata";
import {
  FACEBOOK_PAGES_MCP_INPUT_SCHEMA,
  scrapeFacebookPages,
} from "@/tools/facebook-pages/runtime";
import { FACEBOOK_PAGES_METADATA } from "@/tools/facebook-pages/metadata";
import {
  extractWebsiteContactDetails,
  WEBSITE_CONTACT_DETAILS_MCP_INPUT_SCHEMA,
} from "@/tools/website-contact-details/runtime";
import { WEBSITE_CONTACT_DETAILS_METADATA } from "@/tools/website-contact-details/metadata";

// Remote MCP server (Streamable HTTP) at /api/mcp — the endpoint users add
// to Claude, Claude Cowork, or Claude Desktop as a custom connector. Auth
// accepts any live `bf_` API key: OAuth-issued access tokens ARE api_keys
// rows, and a hand-pasted key from /keys works identically. Browser fetch
// tools are forwarded to the Python backend with that key, so validation,
// plan checks, and usage metering happen exactly as for the REST API.

const API_BASE = process.env.BETTER_FETCH_API_URL ?? "https://api.betterfetch.co";
const SITE_BASE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://betterfetch.co";
const MOBILE_SEARCH_USER_AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

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

const ACCOUNT_LEVEL_ERRORS = new Set([
  "payment_required",
  "quota_exceeded",
  "session_limit_exceeded",
  "unauthorized",
]);

const handler = createMcpHandler(
  (server) => {
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
          country: COUNTRY,
          session: SESSION,
        },
      },
      async (args, extra) => {
        const result = await callFetchApi(extra.authInfo!.token, {
          url: args.url,
          timeout_ms: args.timeout_ms,
          country: args.country,
          session: args.session,
          return_cf_clearance: true,
        });
        if (result.ok === false) return toolError(result);
        return asText({
          status: result.status,
          final_url: result.final_url,
          cf_clearance: result.cf_clearance ?? null,
          cf_clearance_cookie: result.cf_clearance_cookie ?? null,
          session: result.cf_clearance_session ?? null,
        });
      },
    );

    server.registerTool(
      WEBSITE_CONTENT_CRAWLER_METADATA.mcpName,
      {
        title: WEBSITE_CONTENT_CRAWLER_METADATA.title,
        description: MCP_TOOL_DESCRIPTIONS.website_content_crawler,
        inputSchema: WEBSITE_CONTENT_CRAWLER_MCP_INPUT_SCHEMA,
      },
      async (args, extra) => {
        const crawl = await crawlWebsiteContent(args, async (request) => {
          return callFetchApi(extra.authInfo!.token, {
            url: request.url,
            wait_ms: request.wait_ms,
            timeout_ms: request.timeout_ms,
            strategy: request.strategy,
            country: request.country,
            session: request.session,
            cache_ttl_ms: request.cache_ttl_ms,
            return_response_text: true,
            include_html: true,
          });
        });
        const firstError = crawl.errors[0];
        if (
          crawl.item_count === 0 &&
          firstError &&
          ACCOUNT_LEVEL_ERRORS.has(firstError.error)
        ) {
          return toolError({
            error: firstError.error,
            message: firstError.message,
          });
        }
        return asText(crawl);
      },
    );

    server.registerTool(
      WEBSITE_LOGO_EXTRACTOR_METADATA.mcpName,
      {
        title: WEBSITE_LOGO_EXTRACTOR_METADATA.title,
        description: MCP_TOOL_DESCRIPTIONS.website_logo_extractor,
        inputSchema: WEBSITE_LOGO_EXTRACTOR_MCP_INPUT_SCHEMA,
      },
      async (args, extra) => {
        const extraction = await extractWebsiteLogos(args, async (request) => {
          const result = await callFetchApi(extra.authInfo!.token, {
            url: request.url,
            timeout_ms: request.timeoutSecs * 1000,
            strategy: request.strategy,
            cache_ttl_ms: 30_000,
            return_response_text: true,
            include_html: request.responseKind === "html",
            extra_headers:
              request.responseKind === "json"
                ? { Accept: "application/json" }
                : undefined,
          });
          return {
            ok: result.ok,
            error: result.error,
            message: result.message,
            status: result.status,
            final_url: result.final_url,
            title: result.title,
            html: result.html,
            body_text: result.body_text,
          };
        });
        const firstError = extraction.results.find((result) => result.error);
        if (
          extraction.results.length > 0 &&
          extraction.results.every((result) => result.error) &&
          firstError?.error &&
          ACCOUNT_LEVEL_ERRORS.has(firstError.error)
        ) {
          return toolError({ error: firstError.error, message: firstError.error });
        }
        return asText(extraction);
      },
    );

    server.registerTool(
      SITEMAP_URL_EXTRACTOR_METADATA.mcpName,
      {
        title: SITEMAP_URL_EXTRACTOR_METADATA.title,
        description: MCP_TOOL_DESCRIPTIONS.sitemap_url_extractor,
        inputSchema: SITEMAP_URL_EXTRACTOR_MCP_INPUT_SCHEMA,
      },
      async (args, extra) => {
        const extraction = await extractSitemapUrls(args, async (request) => {
          const result = await callFetchApi(extra.authInfo!.token, {
            url: request.url,
            timeout_ms: request.timeoutSecs * 1000,
            strategy: "http",
            cache_ttl_ms: 30_000,
            return_response_text: true,
            include_html: false,
            extra_headers: { Accept: "application/xml,text/xml,*/*" },
          });
          return {
            ok: result.ok,
            error: result.error,
            message: result.message,
            status: result.status,
            final_url: result.final_url,
            body_text: result.body_text,
            html: result.html,
          };
        });
        const firstError = extraction.errors[0];
        if (
          extraction.item_count === 0 &&
          firstError &&
          ACCOUNT_LEVEL_ERRORS.has(firstError.error)
        ) {
          return toolError({ error: firstError.error, message: firstError.error });
        }
        return asText(extraction);
      },
    );

    server.registerTool(
      RSS_FEED_READER_METADATA.mcpName,
      {
        title: RSS_FEED_READER_METADATA.title,
        description: MCP_TOOL_DESCRIPTIONS.rss_feed_reader,
        inputSchema: RSS_FEED_READER_MCP_INPUT_SCHEMA,
      },
      async (args, extra) => {
        const extraction = await readRssFeeds(args, async (request) => {
          const result = await callFetchApi(extra.authInfo!.token, {
            url: request.url,
            timeout_ms: request.timeoutSecs * 1000,
            strategy: "http",
            cache_ttl_ms: 30_000,
            return_response_text: true,
            include_html: false,
            extra_headers: {
              Accept:
                "application/rss+xml,application/atom+xml,application/feed+json,application/json,text/xml,application/xml,*/*",
            },
          });
          return {
            ok: result.ok,
            error: result.error,
            message: result.message,
            status: result.status,
            final_url: result.final_url,
            body_text: result.body_text,
            html: result.html,
            json: result.json,
            content_type: result.content_type,
          };
        });
        const firstError = extraction.errors[0];
        if (
          extraction.item_count === 0 &&
          firstError &&
          ACCOUNT_LEVEL_ERRORS.has(firstError.error)
        ) {
          return toolError({ error: firstError.error, message: firstError.error });
        }
        return asText(extraction);
      },
    );

    server.registerTool(
      GOOGLE_SEARCH_RESULTS_METADATA.mcpName,
      {
        title: GOOGLE_SEARCH_RESULTS_METADATA.title,
        description: MCP_TOOL_DESCRIPTIONS.google_search_results,
        inputSchema: GOOGLE_SEARCH_RESULTS_MCP_INPUT_SCHEMA,
      },
      async (args, extra) => {
        const extraction = await scrapeGoogleSearchResults(args, async (request) => {
          const result = await callFetchApi(extra.authInfo!.token, {
            url: request.url,
            timeout_ms: request.timeoutSecs * 1000,
            strategy: request.strategy,
            country: request.countryCode,
            cache_ttl_ms: 30_000,
            return_response_text: true,
            include_html: true,
            wait_ms: request.strategy === "http" ? undefined : 1000,
            user_agent: request.mobileResults ? MOBILE_SEARCH_USER_AGENT : undefined,
            extra_headers: {
              Accept:
                "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
              "Accept-Language": `${request.languageCode},en;q=0.8`,
            },
          });
          return {
            ok: result.ok,
            error: result.error,
            message: result.message,
            status: result.status,
            final_url: result.final_url,
            html: result.html,
            body_text: result.body_text,
            title: result.title,
          };
        });
        const firstError = extraction.errors[0];
        if (
          extraction.page_count === 0 &&
          firstError &&
          ACCOUNT_LEVEL_ERRORS.has(firstError.error)
        ) {
          return toolError({ error: firstError.error, message: firstError.error });
        }
        return asText(extraction);
      },
    );

    server.registerTool(
      GOOGLE_MAPS_PLACES_METADATA.mcpName,
      {
        title: GOOGLE_MAPS_PLACES_METADATA.title,
        description: MCP_TOOL_DESCRIPTIONS.google_maps_places,
        inputSchema: GOOGLE_MAPS_PLACES_MCP_INPUT_SCHEMA,
      },
      async (args, extra) => {
        const extraction = await scrapeGoogleMapsPlaces(args, async (request) => {
          const result = await callFetchApi(extra.authInfo!.token, {
            url: request.url,
            timeout_ms: request.timeoutSecs * 1000,
            strategy: request.strategy,
            country: request.countryCode,
            cache_ttl_ms: 30_000,
            return_response_text: true,
            include_html: true,
            wait_ms: request.strategy === "http" ? undefined : 2000,
            extra_headers: {
              Accept:
                "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
              "Accept-Language": `${request.languageCode},en;q=0.8`,
            },
          });
          return {
            ok: result.ok,
            error: result.error,
            message: result.message,
            status: result.status,
            final_url: result.final_url,
            html: result.html,
            body_text: result.body_text,
            title: result.title,
          };
        });
        const firstError = extraction.errors[0];
        if (
          extraction.item_count === 0 &&
          firstError &&
          ACCOUNT_LEVEL_ERRORS.has(firstError.error)
        ) {
          return toolError({ error: firstError.error, message: firstError.error });
        }
        return asText(extraction);
      },
    );

    server.registerTool(
      AMAZON_PRODUCT_DETAILS_METADATA.mcpName,
      {
        title: AMAZON_PRODUCT_DETAILS_METADATA.title,
        description: MCP_TOOL_DESCRIPTIONS.amazon_product_details,
        inputSchema: AMAZON_PRODUCT_DETAILS_MCP_INPUT_SCHEMA,
      },
      async (args, extra) => {
        const extraction = await scrapeAmazonProductDetails(args, async (request) => {
          const result = await callFetchApi(extra.authInfo!.token, {
            url: request.url,
            timeout_ms: request.timeoutSecs * 1000,
            strategy: request.strategy,
            country: request.countryCode,
            cache_ttl_ms: 30_000,
            return_response_text: true,
            include_html: true,
            wait_ms: request.strategy === "http" ? undefined : 1500,
            extra_headers: {
              Accept:
                "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
              "Accept-Language": `${request.languageCode},en;q=0.8`,
            },
          });
          return {
            ok: result.ok,
            error: result.error,
            message: result.message,
            status: result.status,
            final_url: result.final_url,
            html: result.html,
            body_text: result.body_text,
            title: result.title,
          };
        });
        const firstError = extraction.errors[0];
        if (
          extraction.item_count === 0 &&
          firstError &&
          ACCOUNT_LEVEL_ERRORS.has(firstError.error)
        ) {
          return toolError({ error: firstError.error, message: firstError.error });
        }
        return asText(extraction);
      },
    );

    server.registerTool(
      YOUTUBE_VIDEO_DETAILS_METADATA.mcpName,
      {
        title: YOUTUBE_VIDEO_DETAILS_METADATA.title,
        description: MCP_TOOL_DESCRIPTIONS.youtube_video_details,
        inputSchema: YOUTUBE_VIDEO_DETAILS_MCP_INPUT_SCHEMA,
      },
      async (args, extra) => {
        const extraction = await scrapeYoutubeVideoDetails(args, async (request) => {
          const result = await callFetchApi(extra.authInfo!.token, {
            url: request.url,
            timeout_ms: request.timeoutSecs * 1000,
            strategy: request.strategy,
            country: request.countryCode,
            cache_ttl_ms: 30_000,
            return_response_text: true,
            include_html: true,
            wait_ms: request.strategy === "http" ? undefined : 1500,
            extra_headers: {
              Accept:
                "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
              "Accept-Language": `${request.languageCode},en;q=0.8`,
            },
          });
          return {
            ok: result.ok,
            error: result.error,
            message: result.message,
            status: result.status,
            final_url: result.final_url,
            html: result.html,
            body_text: result.body_text,
            title: result.title,
          };
        });
        const firstError = extraction.errors[0];
        if (
          extraction.item_count === 0 &&
          firstError &&
          ACCOUNT_LEVEL_ERRORS.has(firstError.error)
        ) {
          return toolError({ error: firstError.error, message: firstError.error });
        }
        return asText(extraction);
      },
    );

    server.registerTool(
      REDDIT_POSTS_COMMENTS_METADATA.mcpName,
      {
        title: REDDIT_POSTS_COMMENTS_METADATA.title,
        description: MCP_TOOL_DESCRIPTIONS.reddit_posts_comments,
        inputSchema: REDDIT_POSTS_COMMENTS_MCP_INPUT_SCHEMA,
      },
      async (args, extra) => {
        const extraction = await scrapeRedditPostsComments(args, async (request) => {
          const result = await callFetchApi(extra.authInfo!.token, {
            url: request.url,
            timeout_ms: request.timeoutSecs * 1000,
            strategy: request.strategy,
            country: request.countryCode,
            cache_ttl_ms: 30_000,
            return_response_text: true,
            include_html: true,
            wait_ms: request.strategy === "http" ? undefined : 1500,
            extra_headers: {
              Accept:
                "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
              "Accept-Language": `${request.languageCode},en;q=0.8`,
            },
          });
          return {
            ok: result.ok,
            error: result.error,
            message: result.message,
            status: result.status,
            final_url: result.final_url,
            html: result.html,
            body_text: result.body_text,
            title: result.title,
          };
        });
        const firstError = extraction.errors[0];
        if (
          extraction.item_count === 0 &&
          firstError &&
          ACCOUNT_LEVEL_ERRORS.has(firstError.error)
        ) {
          return toolError({ error: firstError.error, message: firstError.error });
        }
        return asText(extraction);
      },
    );

    server.registerTool(
      INSTAGRAM_PROFILE_POSTS_METADATA.mcpName,
      {
        title: INSTAGRAM_PROFILE_POSTS_METADATA.title,
        description: MCP_TOOL_DESCRIPTIONS.instagram_profile_posts,
        inputSchema: INSTAGRAM_PROFILE_POSTS_MCP_INPUT_SCHEMA,
      },
      async (args, extra) => {
        const extraction = await scrapeInstagramProfilePosts(args, async (request) => {
          const result = await callFetchApi(extra.authInfo!.token, {
            url: request.url,
            timeout_ms: request.timeoutSecs * 1000,
            strategy: request.strategy,
            country: request.countryCode,
            cache_ttl_ms: 30_000,
            return_response_text: true,
            include_html: true,
            wait_ms: request.strategy === "http" ? undefined : 1500,
            extra_headers: {
              Accept:
                "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
              "Accept-Language": `${request.languageCode},en;q=0.8`,
            },
          });
          return {
            ok: result.ok,
            error: result.error,
            message: result.message,
            status: result.status,
            final_url: result.final_url,
            html: result.html,
            body_text: result.body_text,
            title: result.title,
          };
        });
        const firstError = extraction.errors[0];
        if (
          extraction.item_count === 0 &&
          firstError &&
          ACCOUNT_LEVEL_ERRORS.has(firstError.error)
        ) {
          return toolError({ error: firstError.error, message: firstError.error });
        }
        return asText(extraction);
      },
    );

    server.registerTool(
      TIKTOK_PROFILE_VIDEOS_METADATA.mcpName,
      {
        title: TIKTOK_PROFILE_VIDEOS_METADATA.title,
        description: MCP_TOOL_DESCRIPTIONS.tiktok_profile_videos,
        inputSchema: TIKTOK_PROFILE_VIDEOS_MCP_INPUT_SCHEMA,
      },
      async (args, extra) => {
        const extraction = await scrapeTiktokProfileVideos(args, async (request) => {
          const result = await callFetchApi(extra.authInfo!.token, {
            url: request.url,
            timeout_ms: request.timeoutSecs * 1000,
            strategy: request.strategy,
            country: request.countryCode,
            cache_ttl_ms: 30_000,
            return_response_text: true,
            include_html: true,
            wait_ms: request.strategy === "http" ? undefined : 1500,
            extra_headers: {
              Accept:
                "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
              "Accept-Language": `${request.languageCode},en;q=0.8`,
            },
          });
          return {
            ok: result.ok,
            error: result.error,
            message: result.message,
            status: result.status,
            final_url: result.final_url,
            html: result.html,
            body_text: result.body_text,
            title: result.title,
          };
        });
        const firstError = extraction.errors[0];
        if (
          extraction.item_count === 0 &&
          firstError &&
          ACCOUNT_LEVEL_ERRORS.has(firstError.error)
        ) {
          return toolError({ error: firstError.error, message: firstError.error });
        }
        return asText(extraction);
      },
    );

    server.registerTool(
      META_ADS_LIBRARY_METADATA.mcpName,
      {
        title: META_ADS_LIBRARY_METADATA.title,
        description: MCP_TOOL_DESCRIPTIONS.meta_ads_library,
        inputSchema: META_ADS_LIBRARY_MCP_INPUT_SCHEMA,
      },
      async (args, extra) => {
        const extraction = await scrapeMetaAdsLibrary(args, async (request) => {
          const result = await callFetchApi(extra.authInfo!.token, {
            url: request.url,
            timeout_ms: request.timeoutSecs * 1000,
            strategy: request.strategy,
            country: request.countryCode,
            cache_ttl_ms: 30_000,
            return_response_text: true,
            include_html: true,
            wait_ms: request.strategy === "http" ? undefined : 1500,
            extra_headers: {
              Accept:
                "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
              "Accept-Language": `${request.languageCode},en;q=0.8`,
            },
          });
          return {
            ok: result.ok,
            error: result.error,
            message: result.message,
            status: result.status,
            final_url: result.final_url,
            html: result.html,
            body_text: result.body_text,
            title: result.title,
          };
        });
        const firstError = extraction.errors[0];
        if (
          extraction.item_count === 0 &&
          firstError &&
          ACCOUNT_LEVEL_ERRORS.has(firstError.error)
        ) {
          return toolError({ error: firstError.error, message: firstError.error });
        }
        return asText(extraction);
      },
    );

    server.registerTool(
      X_PROFILE_POSTS_METADATA.mcpName,
      {
        title: X_PROFILE_POSTS_METADATA.title,
        description: MCP_TOOL_DESCRIPTIONS.x_profile_posts,
        inputSchema: X_PROFILE_POSTS_MCP_INPUT_SCHEMA,
      },
      async (args, extra) => {
        const extraction = await scrapeXProfilePosts(args, async (request) => {
          const result = await callFetchApi(extra.authInfo!.token, {
            url: request.url,
            timeout_ms: request.timeoutSecs * 1000,
            strategy: request.strategy,
            country: request.countryCode,
            cache_ttl_ms: 30_000,
            return_response_text: true,
            include_html: true,
            wait_ms: request.strategy === "http" ? undefined : 1500,
            extra_headers: {
              Accept:
                "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
              "Accept-Language": `${request.languageCode},en;q=0.8`,
            },
          });
          return {
            ok: result.ok,
            error: result.error,
            message: result.message,
            status: result.status,
            final_url: result.final_url,
            html: result.html,
            body_text: result.body_text,
            title: result.title,
          };
        });
        const firstError = extraction.errors[0];
        if (
          extraction.item_count === 0 &&
          firstError &&
          ACCOUNT_LEVEL_ERRORS.has(firstError.error)
        ) {
          return toolError({ error: firstError.error, message: firstError.error });
        }
        return asText(extraction);
      },
    );

    server.registerTool(
      FACEBOOK_PAGES_METADATA.mcpName,
      {
        title: FACEBOOK_PAGES_METADATA.title,
        description: MCP_TOOL_DESCRIPTIONS.facebook_pages,
        inputSchema: FACEBOOK_PAGES_MCP_INPUT_SCHEMA,
      },
      async (args, extra) => {
        const extraction = await scrapeFacebookPages(args, async (request) => {
          const result = await callFetchApi(extra.authInfo!.token, {
            url: request.url,
            timeout_ms: request.timeoutSecs * 1000,
            strategy: request.strategy,
            country: request.countryCode,
            cache_ttl_ms: 30_000,
            return_response_text: true,
            include_html: true,
            wait_ms: request.strategy === "http" ? undefined : 1500,
            extra_headers: {
              Accept:
                "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
              "Accept-Language": `${request.languageCode},en;q=0.8`,
            },
          });
          return {
            ok: result.ok,
            error: result.error,
            message: result.message,
            status: result.status,
            final_url: result.final_url,
            html: result.html,
            body_text: result.body_text,
            title: result.title,
          };
        });
        const firstError = extraction.errors[0];
        if (
          extraction.item_count === 0 &&
          firstError &&
          ACCOUNT_LEVEL_ERRORS.has(firstError.error)
        ) {
          return toolError({ error: firstError.error, message: firstError.error });
        }
        return asText(extraction);
      },
    );

    server.registerTool(
      WEBSITE_CONTACT_DETAILS_METADATA.mcpName,
      {
        title: WEBSITE_CONTACT_DETAILS_METADATA.title,
        description: MCP_TOOL_DESCRIPTIONS.website_contact_details,
        inputSchema: WEBSITE_CONTACT_DETAILS_MCP_INPUT_SCHEMA,
      },
      async (args, extra) => {
        const extraction = await extractWebsiteContactDetails(args, async (request) => {
          const result = await callFetchApi(extra.authInfo!.token, {
            url: request.url,
            timeout_ms: request.timeoutSecs * 1000,
            strategy: request.strategy,
            country: request.countryCode,
            cache_ttl_ms: 30_000,
            return_response_text: true,
            include_html: true,
            wait_ms: request.strategy === "http" ? undefined : 1000,
            extra_headers: {
              Accept:
                "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
              "Accept-Language": `${request.languageCode},en;q=0.8`,
            },
          });
          return {
            ok: result.ok,
            error: result.error,
            message: result.message,
            status: result.status,
            final_url: result.final_url,
            html: result.html,
            body_text: result.body_text,
            title: result.title,
          };
        });
        const firstError = extraction.errors[0];
        if (
          extraction.item_count === 0 &&
          firstError &&
          ACCOUNT_LEVEL_ERRORS.has(firstError.error)
        ) {
          return toolError({ error: firstError.error, message: firstError.error });
        }
        return asText(extraction);
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
          country: COUNTRY,
          session: SESSION,
        },
      },
      async (args, extra) => {
        const result = await callFetchApi(extra.authInfo!.token, {
          url: args.url,
          timeout_ms: args.timeout_ms,
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
            "tier, status, monthly_quota, session_limit, session_idle_ttl_days, current_period_start, current_period_end",
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
        let calls = 0;
        if (sub.current_period_start) {
          const { data: usage } = await admin
            .from("usage_counters")
            .select("calls")
            .eq("user_id", userId)
            .eq("period_start", sub.current_period_start)
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
          period_ends: sub.current_period_end,
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
    serverInfo: {
      name: "better-fetch",
      title: "Better Fetch",
      version: "1.2.0",
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
