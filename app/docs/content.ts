// Canonical API reference content. The rendered /docs page and /docs/llms.txt
// are both generated from this file so human and agent docs stay aligned.

export type Field = {
  name: string;
  type: string;
  default?: string;
  description: string;
};

export const REQUEST_FIELDS: Field[] = [
  {
    name: "url",
    type: "string",
    default: "required",
    description: "HTTP or HTTPS URL to fetch.",
  },
  {
    name: "wait_until",
    type: "string",
    default: '"load"',
    description:
      "Browser navigation state when the browser path is selected: load, domcontentloaded, networkidle, or commit.",
  },
  {
    name: "wait_selector",
    type: "string",
    description:
      "CSS selector to wait for after navigation. Use this for pages that render content after the initial load.",
  },
  {
    name: "wait_ms",
    type: "number",
    description:
      "Extra fixed wait after navigation, in milliseconds. Capped by timeout_ms. Use only when there is no reliable selector.",
  },
  {
    name: "timeout_ms",
    type: "number",
    default: "90000",
    description:
      "Navigation and selector timeout in milliseconds. Maximum 240000. The default is deliberately generous so the first call after a cold browser start has room to finish.",
  },
  {
    name: "cache_ttl_ms",
    type: "number",
    default: "0",
    description:
      "Optional short-lived in-process response cache TTL for identical synchronous fetch payloads. Range 0-60000. Hits are best effort per API worker; the cache key ignores cache_ttl_ms itself.",
  },
  {
    name: "strategy",
    type: '"auto" | "http" | "browser"',
    default: '"auto"',
    description:
      "Execution strategy. auto uses direct HTTP for simple body/JSON fetches and Chromium when the payload asks for browser-only features or the fast path looks blocked. http returns the raw HTTP response without browser-only features. browser forces the rendered browser path.",
  },
  {
    name: "return_response_text",
    type: "boolean",
    default: "false",
    description:
      "Include the raw response body in body_text. JSON responses include it automatically. When set with a non-HTML URL, this also participates in auto strategy selection.",
  },
  {
    name: "include_html",
    type: "boolean",
    default: "true",
    description:
      "Include rendered/raw HTML in html. Set false for JSON/body workflows to reduce response size and skip origin DOM serialization in browser JSON mode.",
  },
  {
    name: "return_cf_clearance",
    type: "boolean",
    default: "false",
    description:
      "Attempt to collect Cloudflare cf_clearance token data and return it when the browser receives that cookie. When false, cookies are not read or returned.",
  },
  {
    name: "return_datadome_cookie",
    type: "boolean",
    default: "false",
    description:
      "Attempt to collect DataDome datadome cookie data and return it when the rendered browser session receives that cookie. When false, DataDome cookie fields are not read or returned.",
  },
  {
    name: "return_cookies",
    type: "boolean",
    default: "false",
    description:
      "Return storage-ready cookies visible to the final rendered page in cookies.",
  },
  {
    name: "cookies",
    type: "array",
    default: "[]",
    description:
      "Preload cookies into the browser context before navigation. Each cookie needs name and value plus either url or domain; path defaults to / when domain is used.",
  },
  {
    name: "capture_network",
    type: "boolean",
    default: "false",
    description:
      "Capture matching browser network calls and return them in network. Defaults to XHR/fetch only — useful for API discovery and debugging.",
  },
  {
    name: "network_resource_types",
    type: "string[]",
    default: '["xhr","fetch"]',
    description:
      "Playwright resource types to capture, e.g. xhr, fetch, document, script, or websocket. Keep this narrow for most workloads.",
  },
  {
    name: "network_include_bodies",
    type: "boolean",
    default: "true",
    description:
      "Include capped response bodies for captured network responses.",
  },
  {
    name: "network_include_headers",
    type: "boolean",
    default: "false",
    description:
      "Include request and response headers for captured entries. Off by default because headers can contain cookies, bearer tokens, or other secrets.",
  },
  {
    name: "network_max_entries",
    type: "number",
    default: "100",
    description: "Maximum matching network entries to return. Range 1–500.",
  },
  {
    name: "network_max_body_bytes",
    type: "number",
    default: "262144",
    description:
      "Maximum bytes kept from each captured response body. Range 0–1048576.",
  },
  {
    name: "network_capture_streams",
    type: "boolean",
    default: "false",
    description:
      "When capture_network is true, capture streamed fetch/XHR chunks, EventSource messages, and WebSocket messages in network_streams.",
  },
  {
    name: "network_stream_max_events",
    type: "number",
    default: "100",
    description: "Maximum streamed network values to return. Range 1–500.",
  },
  {
    name: "network_stream_max_value_bytes",
    type: "number",
    default: "65536",
    description:
      "Maximum bytes kept from each streamed network value. Range 0–262144.",
  },
  {
    name: "screenshot",
    type: "boolean",
    default: "false",
    description:
      "Include a PNG screenshot encoded as base64. Screenshots can make responses much larger, so request them only when needed.",
  },
  {
    name: "full_page",
    type: "boolean",
    default: "false",
    description: "Capture the full scrollable page when screenshot is true.",
  },
  {
    name: "country",
    type: "string",
    description:
      "Two-letter country code for browser geo-emulation, e.g. us, gb, de, au, ca. When geoip is true and locale/timezone are unset, Better Fetch applies representative browser defaults for that country. This does not change network egress IP.",
  },
  {
    name: "session",
    type: "string",
    description:
      "Account-scoped browser identity key. Reuse it to keep the same warm browser context, fingerprint, cookies, localStorage, and encrypted portable snapshot. Only letters and numbers form the canonical key today, so punctuation is ignored.",
  },
  {
    name: "geoip",
    type: "boolean",
    default: "true when country is set",
    description:
      "When country is set, apply country-derived browser timezone/locale defaults unless explicit locale/timezone values are supplied. This does not spoof WebRTC IP or change network egress IP.",
  },
  {
    name: "locale",
    type: "string",
    default: "automatic",
    description:
      "Browser locale, e.g. en-GB. Overrides the country-derived locale.",
  },
  {
    name: "timezone",
    type: "string",
    default: "automatic",
    description:
      "Browser timezone, e.g. Europe/London. Overrides the country-derived timezone.",
  },
  {
    name: "user_agent",
    type: "string",
    default: "browser default",
    description:
      "Custom user agent applied to the browser context. Usually leave unset — it forms part of a session's warm-context identity.",
  },
  {
    name: "extra_headers",
    type: "object",
    default: "{}",
    description: "Additional HTTP headers applied to the direct HTTP request or inside the browser context.",
  },
  {
    name: "humanize",
    type: "boolean",
    default: "auto",
    description:
      "Human-like mouse, keyboard, and scroll behavior for browser fetches. Defaults to true for rendered browser pages and false for direct/API calls. Set explicitly to override.",
  },
  {
    name: "json_mode",
    type: "boolean",
    default: "auto",
    description:
      "Fetch via an in-page browser fetch() call instead of a top-level browser navigation. Sends Sec-Fetch-Mode: cors and a natural Referer from the URL's origin. Set explicitly only when strategy=browser or auto should keep browser semantics; plain auto uses direct HTTP first.",
  },
];

export const RESPONSE_FIELDS: Field[] = [
  {
    name: "ok",
    type: "boolean",
    description:
      "true when Better Fetch completed the request — not whether the target accepted it. Check status and blocked for the target's verdict.",
  },
  {
    name: "status",
    type: "number | null",
    description: "HTTP status from the target response (navigation or in-page fetch).",
  },
  {
    name: "final_url",
    type: "string",
    description: "Final target URL after redirects.",
  },
  {
    name: "title",
    type: "string",
    description:
      "Page title after rendering, or the parsed title for direct HTTP HTML responses.",
  },
  {
    name: "html",
    type: "string",
    description:
      "Rendered DOM HTML from the browser, or raw HTML from the direct HTTP transport. Empty when include_html is false.",
  },
  {
    name: "body_text",
    type: "string | null",
    description:
      "Raw response body when requested, when the target response is JSON, or when strategy=http. Capped at 50 MB — see body_truncated.",
  },
  {
    name: "body_bytes",
    type: "number",
    description:
      "Total response body size in bytes when measured by a body-fetch strategy. When body_truncated is true, this is larger than body_text.length.",
  },
  {
    name: "body_truncated",
    type: "boolean",
    description:
      "True when the response body exceeded the 50 MB transfer cap and was truncated. Reduce per_page or narrow the query if you need the complete body.",
  },
  {
    name: "content_type",
    type: "string",
    description:
      "Normalized response Content-Type media type without parameters, for example text/html or application/json. Empty when unavailable.",
  },
  {
    name: "content_kind",
    type: '"html" | "json" | "text" | "binary" | "empty" | "unknown"',
    description:
      "Best-effort response body category for routing parser logic.",
  },
  {
    name: "json_parse_ok",
    type: "boolean",
    description: "Whether body_text parsed as JSON.",
  },
  {
    name: "json",
    type: "any | null",
    description:
      "Parsed JSON payload when json_parse_ok is true; otherwise null.",
  },
  {
    name: "headers",
    type: "object",
    description:
      "Response headers from the target navigation response (string values).",
  },
  {
    name: "screenshot_b64",
    type: "string | null",
    description: "Base64-encoded PNG when screenshot is true; otherwise null.",
  },
  {
    name: "cf_clearance",
    type: "string | null",
    description:
      "Cloudflare cf_clearance token value when return_cf_clearance is true and the target issued it.",
  },
  {
    name: "cf_clearance_cookie",
    type: "object | null",
    description:
      "Storage-ready cookie metadata (name, value, domain, path, expires, httpOnly, secure, sameSite) when requested and present.",
  },
  {
    name: "cf_clearance_session",
    type: "string | null",
    description:
      "The session that produced the clearance result. Blocked retries may rotate to a fresh session before the final result.",
  },
  {
    name: "datadome_cookie",
    type: "string | null",
    description:
      "DataDome datadome cookie value when return_datadome_cookie is true and the target issued it. Otherwise null or omitted.",
  },
  {
    name: "datadome_cookie_detail",
    type: "object | null",
    description:
      "Storage-ready datadome cookie metadata when requested and present. Otherwise null or omitted.",
  },
  {
    name: "datadome_session",
    type: "string | null",
    description:
      "The session that produced the DataDome cookie result. Blocked retries may rotate to a fresh session before the final result.",
  },
  {
    name: "datadome_detected",
    type: "boolean",
    description:
      "Present when return_datadome_cookie is true. true when the rendered page or response showed DataDome signals, even if no datadome cookie was returned.",
  },
  {
    name: "cookies",
    type: "array",
    description:
      "Storage-ready cookies visible to the final rendered page when return_cookies is true. Otherwise omitted.",
  },
  {
    name: "network",
    type: "array",
    description:
      "Captured browser network entries when capture_network is true. Otherwise omitted.",
  },
  {
    name: "network_streams",
    type: "array",
    description:
      "Captured streamed fetch/XHR chunks, EventSource messages, and WebSocket messages when network_capture_streams is true. Otherwise omitted.",
  },
  {
    name: "blocked",
    type: "boolean",
    description:
      "true when the response looks like a bot wall or unsolved challenge — even when the target returns HTTP 200. A solved page that merely carries Turnstile DOM is not blocked.",
  },
  {
    name: "block_reason",
    type: '"none" | "http_401" | "http_403" | "http_429" | "http_503" | "cloudflare" | "datadome" | "captcha" | "block_title" | "challenge_interstitial"',
    description:
      "Stable reason for the blocked verdict. none means the response is not classified as blocked.",
  },
  {
    name: "headed",
    type: "boolean",
    description:
      "Whether the attempt that produced this result ran a headed browser (set on escalated retries).",
  },
  {
    name: "pooled",
    type: "boolean",
    description:
      "true when served from a warm pooled context (session requests); false for sessionless ephemeral contexts.",
  },
  {
    name: "transport",
    type: '"http" | "browser"',
    description:
      "Execution transport that produced the result.",
  },
  {
    name: "cache_status",
    type: '"bypass" | "miss" | "hit" | "coalesced"',
    description:
      "Synchronous fetch cache status. bypass means no cache was requested or enabled; miss means the target was fetched; hit means a completed prior result was reused; coalesced means an identical in-flight fetch was shared.",
  },
  {
    name: "attempts",
    type: "number",
    description:
      "Total attempts including the first. Greater than 1 means the service retried on a fresh session — after a block or a transient navigation timeout.",
  },
  {
    name: "timing_ms",
    type: "number",
    description: "Time spent inside the fetch request (final attempt).",
  },
];

export type Example = {
  id: string;
  title: string;
  description: string;
  code: string;
  note?: string;
};

export type Guide = {
  id: string;
  title: string;
  description: string;
  points: string[];
};

export const JOB_RESPONSE_FIELDS: Field[] = [
  {
    name: "ok",
    type: "boolean",
    description: "true when the job was found and belongs to the authenticated account.",
  },
  {
    name: "id",
    type: "string",
    description: "Job identifier (UUID).",
  },
  {
    name: "status",
    type: "string",
    description:
      "Current job state: queued, running, done, or failed.",
  },
  {
    name: "result",
    type: "object | null",
    description:
      "Full FetchSuccess payload (same shape as POST /v1/fetch) when status is done; otherwise null.",
  },
  {
    name: "error",
    type: "string | null",
    description: "Error message when status is failed; otherwise null.",
  },
  {
    name: "created_at",
    type: "string",
    description: "ISO timestamp when the job was admitted.",
  },
  {
    name: "started_at",
    type: "string | null",
    description: "ISO timestamp when the browser work began.",
  },
  {
    name: "completed_at",
    type: "string | null",
    description: "ISO timestamp when the job reached done or failed.",
  },
  {
    name: "expires_at",
    type: "string",
    description:
      "ISO timestamp after which the job result is cleaned up (24 hours after creation by default).",
  },
];

const H = `-H "Authorization: Bearer $BETTER_FETCH_API_KEY" \\\n  -H "Content-Type: application/json"`;

export const EXAMPLES: Example[] = [
  {
    id: "example-html",
    title: "Fetch rendered HTML",
    description:
      "The basic call: navigate with a real browser and return the rendered DOM.",
    code: `curl -sS -X POST "https://api.betterfetch.co/v1/fetch" \\
  ${H} \\
  -d '{
    "url": "https://example.com",
    "wait_until": "domcontentloaded",
    "timeout_ms": 60000
  }' | jq '.status, .title, .final_url'`,
  },
  {
    id: "example-region",
    title: "Fetch with country browser identity",
    description:
      "Use country when browser locale/timezone should match a country, and session when several requests should share one browser profile.",
    code: `curl -sS -X POST "https://api.betterfetch.co/v1/fetch" \\
  ${H} \\
  -d '{
    "url": "https://example.com",
    "country": "gb",
    "session": "examplegb",
    "wait_until": "domcontentloaded",
    "timeout_ms": 60000
  }'`,
    note: "Session names are scoped to your Better Fetch account; other accounts using the same name get isolated browser profiles and encrypted snapshots. Use alphanumeric names when you need distinct sessions; today example-gb, example_gb, and examplegb point at the same session.",
  },
  {
    id: "example-json-simple",
    title: "Fetch a JSON API (quick start)",
    description:
      "Minimal JSON call. With strategy auto, Better Fetch uses the direct HTTP fast path for this shape and returns parsed JSON plus body_bytes.",
    code: `curl -sS -X POST "https://api.betterfetch.co/v1/fetch" \\
  ${H} \\
  -d '{
    "url": "https://jsonplaceholder.typicode.com/todos/1",
    "include_html": false,
    "extra_headers": { "Accept": "application/json" }
  }' | jq '{ ok, status, transport, cache_status, content_type, content_kind, json_parse_ok, body_bytes, timing_ms }'`,
    note: "If jq shows null for every field, the call failed — inspect ok, error, and message first (see Tips). Keys must start with bf_ and come from your keys page.",
  },
  {
    id: "example-json",
    title: "Fetch a JSON API",
    description:
      "For harder JSON APIs, pass the SPA Referer/Origin plus a stable session. Add country only when browser locale/timezone should match the target. auto starts with the fast HTTP path and falls back to the browser path if the response looks blocked; set strategy: browser to force the old in-page fetch behavior.",
    code: `curl -sS -X POST "https://api.betterfetch.co/v1/fetch" \\
  ${H} \\
  -d '{
    "url": "https://partner-api.example.com/projections?per_page=500",
    "country": "us",
    "session": "exampleus",
    "return_response_text": true,
    "include_html": false,
    "extra_headers": {
      "Accept": "application/json",
      "Referer": "https://app.example.com/",
      "Origin": "https://app.example.com"
    },
    "timeout_ms": 60000
  }' | jq '{ ok, status, transport, cache_status, content_type, content_kind, json_parse_ok, body_bytes, body_truncated, timing_ms, blocked, block_reason }'`,
    note: "strategy auto uses the HTTP fast path for JSON/API body requests, then escalates to the browser if that response looks blocked. Set strategy: browser when the target specifically requires browser CORS/fetch semantics, or strategy: http when you explicitly want raw HTTP only.",
  },
  {
    id: "example-wait",
    title: "Wait for rendered content",
    description:
      "For client-rendered pages, wait for a selector instead of adding a long fixed delay.",
    code: `curl -sS -X POST "https://api.betterfetch.co/v1/fetch" \\
  ${H} \\
  -d '{
    "url": "https://app.example.com/items/123",
    "wait_until": "domcontentloaded",
    "wait_selector": "#content",
    "timeout_ms": 90000
  }'`,
  },
  {
    id: "example-network",
    title: "Capture network calls",
    description:
      "Capture the XHR/fetch calls a page makes while rendering — the fastest way to discover a site's internal APIs.",
    code: `curl -sS -X POST "https://api.betterfetch.co/v1/fetch" \\
  ${H} \\
  -d '{
    "url": "https://app.example.com/items/123",
    "wait_until": "networkidle",
    "timeout_ms": 90000,
    "capture_network": true,
    "network_max_entries": 50
  }' | jq '.network[] | { method, url, status, json }'`,
    note: "Enable network_include_headers only when you need it — headers can contain credentials.",
  },
  {
    id: "example-network-streams",
    title: "Capture streamed values",
    description:
      "Capture values delivered through streaming fetch/XHR, EventSource, or WebSocket while the page is open.",
    code: `curl -sS -X POST "https://api.betterfetch.co/v1/fetch" \\
  ${H} \\
  -d '{
    "url": "https://app.example.com/live",
    "wait_until": "domcontentloaded",
    "wait_ms": 10000,
    "timeout_ms": 90000,
    "capture_network": true,
    "network_capture_streams": true,
    "network_resource_types": ["fetch", "xhr", "eventsource", "websocket"],
    "network_stream_max_events": 100,
    "network_stream_max_value_bytes": 65536
  }' | jq '.network_streams[] | { source, event_type, url, value_text, json }'`,
    note: "Stream capture is opt-in because it instruments page fetch/XHR/EventSource/WebSocket APIs and can produce large responses.",
  },
  {
    id: "example-screenshot",
    title: "Capture a screenshot",
    description: "Return a base64-encoded PNG of the rendered page.",
    code: `curl -sS -X POST "https://api.betterfetch.co/v1/fetch" \\
  ${H} \\
  -d '{
    "url": "https://example.com",
    "screenshot": true,
    "full_page": true,
    "wait_until": "domcontentloaded"
  }' | jq -r '.screenshot_b64'`,
  },
  {
    id: "example-cf",
    title: "Collect a Cloudflare clearance token when issued",
    description:
      "Attempt the page flow and return the cf_clearance cookie when the target issues it, with storage-ready metadata.",
    code: `curl -sS -X POST "https://api.betterfetch.co/v1/fetch" \\
  ${H} \\
  -d '{
    "url": "https://www.example.com/",
    "country": "us",
    "session": "clearanceus",
    "wait_until": "domcontentloaded",
    "timeout_ms": 90000,
    "return_cf_clearance": true
  }' | jq '{ status, blocked, block_reason, cf_clearance, cf_clearance_cookie }'`,
    note: "cf_clearance is null when the target doesn't issue the cookie or the challenge remains unsolved. Store cf_clearance_session too — retries may rotate sessions.",
  },
  {
    id: "example-datadome",
    title: "Collect a DataDome cookie when issued",
    description:
      "Attempt the page flow and return the datadome cookie when the target issues it, with storage-ready metadata.",
    code: `curl -sS -X POST "https://api.betterfetch.co/v1/fetch" \\
  ${H} \\
  -d '{
    "url": "https://www.example.com/",
    "country": "us",
    "session": "datadomeus",
    "wait_until": "domcontentloaded",
    "timeout_ms": 90000,
    "return_datadome_cookie": true
  }' | jq '{ status, blocked, block_reason, datadome_detected, datadome_cookie, datadome_cookie_detail }'`,
    note: "datadome_cookie is null when the target doesn't issue the cookie or the challenge remains unsolved. Reusing the Better Fetch session is usually more reliable than replaying the raw cookie elsewhere.",
  },
  {
    id: "example-cookies",
    title: "Export and replay browser cookies",
    description:
      "Return cookies from a rendered browser session, store them in your system, then send them back on a later request.",
    code: `curl -sS -X POST "https://api.betterfetch.co/v1/fetch" \\
  ${H} \\
  -d '{
    "url": "https://example.com",
    "session": "examplelogin",
    "wait_until": "domcontentloaded",
    "return_cookies": true
  }' | jq '.cookies'

curl -sS -X POST "https://api.betterfetch.co/v1/fetch" \\
  ${H} \\
  -d '{
    "url": "https://example.com/account",
    "session": "examplelogin",
    "cookies": [
      {
        "name": "session",
        "value": "abc123",
        "domain": ".example.com",
        "path": "/",
        "expires": 1790000000,
        "httpOnly": true,
        "secure": true,
        "sameSite": "Lax"
      }
    ]
  }'`,
    note: "Using the same session also reuses your account-scoped server-side browser state. Stored session limits are plan-based: Free 1, Starter 10, Pro 50, Scale 250; sessions expire after 7 idle days.",
  },
  {
    id: "example-job",
    title: "Submit an async job",
    description:
      "When you don't want to hold a connection open — or want to fan out many URLs — submit a fetch as a background job. Returns 202 immediately; poll until status is done or failed.",
    code: `curl -sS -X POST "https://api.betterfetch.co/v1/jobs" \\
  ${H} \\
  -d '{
    "url": "https://example.com",
    "wait_until": "domcontentloaded",
    "timeout_ms": 60000
  }'

# → {"ok": true, "id": "a1b2c3d4-...", "status": "queued"}

curl -sS "https://api.betterfetch.co/v1/jobs/a1b2c3d4-..." \\
  -H "Authorization: Bearer $BETTER_FETCH_API_KEY"

# → {"ok": true, "id": "...", "status": "done", "result": {...}, "error": null, ...}`,
    note: "Jobs run under a separate concurrency budget so they never block synchronous /v1/fetch. A call is counted when the job is admitted, same as /v1/fetch.",
  },
];

export const GUIDES: Guide[] = [
  {
    id: "guide-high-volume",
    title: "High-volume same-site scraping",
    description:
      "When you fetch many URLs on one site in a single run — scanning dozens of markets on a bookmaker, paging through a listing, etc. — these habits avoid most blocks and connection timeouts.",
    points: [
      "Reuse one session per site for the whole run (and across runs) — e.g. session: \"skybet\". A warm session keeps a stable fingerprint and persisted cookies/localStorage that mark you as a returning visitor. Do not generate a fresh session name per URL or per run: each distinct name — and each distinct locale/timezone/user_agent value — is a separate stored session that counts against your plan limit and starts cold.",
      "Use country only for browser identity defaults (gb for UK locale/timezone, au for Australian locale/timezone, etc.). It does not change network egress IP or bypass IP-based geo-restrictions.",
      "Leave user_agent, locale, and timezone unset unless the integration requires them, so country can apply coherent defaults. If you do set them, keep them byte-identical across every call for that session — changing them splits the warm pool into separate cold contexts.",
      "Pace the run: keep concurrency to a few in-flight requests and add a small jittered delay (1–3s) between calls. A sub-second burst of dozens of requests from one IP looks robotic and trips bot detection that can then poison the whole session.",
      "Prefer fast waits on browser pages: wait_until: \"domcontentloaded\" plus wait_selector over networkidle or long fixed waits. For JSON endpoints, set extra_headers {\"Accept\":\"application/json\"}; auto uses direct HTTP first, skips humanization, and returns parsed JSON faster.",
      "For JSON polling, use cache_ttl_ms for short identical bursts and cache longer-lived responses in your application. Reuse one session, shrink query params (per_page, include=), and poll only as often as the data actually changes.",
      "Handle responses defensively in your loop. If blocked is true, inspect block_reason, then pause and back off (5–10s) before continuing. Retry an individual 502 fetch_failed after a short backoff — sustained failures mean the target is pushing back. Keep timeout_ms moderate (45–60s).",
    ],
  },
];

export const ERRORS: { status: string; code: string; meaning: string }[] = [
  {
    status: "400",
    code: "bad_request",
    meaning:
      "Invalid JSON, unknown request field, missing or non-HTTP url, or an out-of-range parameter.",
  },
  {
    status: "401",
    code: "unauthorized",
    meaning: "Missing, incorrect, or revoked bearer token.",
  },
  {
    status: "402",
    code: "payment_required",
    meaning: "Valid key but no active subscription.",
  },
  {
    status: "429",
    code: "quota_exceeded",
    meaning:
      "Monthly call quota exhausted; resets at the next billing cycle. A call is counted when accepted, regardless of fetch outcome.",
  },
  {
    status: "429",
    code: "session_limit_exceeded",
    meaning:
      "Stored browser session limit reached; clear a session from the dashboard or upgrade.",
  },
  {
    status: "502",
    code: "fetch_failed",
    meaning:
      "Browser launch, navigation, or target fetch failed. The message includes the underlying detail. In json_mode, Failed to fetch often means the API's CORS policy rejected the in-page call — set Referer to the site's app origin or try json_mode: false.",
  },
  {
    status: "504",
    code: "timeout",
    meaning: "Request timed out at the API layer.",
  },
];

export const TIPS: string[] = [
  "Every response includes ok. On failure you get { ok: false, error, message, status } — not body_bytes or timing_ms. When debugging with jq, always select ok and error first.",
  "Use content_kind and content_type to route parser logic before inspecting body_text, html, or json.",
  "Set include_html: false for JSON/body workflows when you only need body_text or json, especially with strategy: browser JSON mode.",
  "Use cache_ttl_ms for short scraper bursts that repeat the exact same synchronous fetch payload. It is explicit, off by default, and best effort per API worker; cache_status reports miss, hit, coalesced, or bypass.",
  "For simple page/body fetches, leave strategy as auto; Better Fetch uses direct HTTP and only moves to Chromium when the request asks for browser-only features or the fast path looks blocked.",
  "Use strategy: browser with wait_selector, cookies, screenshots, or network capture when you specifically need rendered DOM behavior.",
  "For JSON APIs, set extra_headers {\"Accept\":\"application/json\"}. strategy auto uses direct HTTP first, then falls back to the browser path if the response looks blocked.",
  "Set strategy: browser when the target specifically requires in-page fetch/CORS semantics from a SPA origin; set strategy: http when you explicitly want raw HTTP and no browser-only features.",
  "When using json_mode, include a Referer header pointing to the site's app/SPA origin (e.g. \"https://app.example.com/\"). Better Fetch navigates to that origin first so CORS and Referer match what the API expects. Without a Referer, the URL's own origin is used.",
  "Large body responses (> 50 MB) are truncated in body-fetch strategies. Check body_truncated and body_bytes — reduce per_page or narrow the query if you need the complete body.",
  "country is browser geo-emulation only: it sets representative locale/timezone defaults when geoip is true and explicit locale/timezone are omitted. It does not change egress IP.",
  "Check GET /v1/health?geo=1&country=us to see the country defaults Better Fetch will apply.",
  "Pass a session for hard targets: it enables an account-scoped warm pooled context, encrypted portable cookie/localStorage snapshots, and a stable fingerprint.",
  "Session names are canonicalized to letters and numbers for backend routing today; punctuation is ignored, so use clearly distinct alphanumeric names when you need separate sessions.",
  "Reuse the same session to keep browser cookies/localStorage across machines; use return_cookies plus cookies when you want caller-managed cookie replay.",
  "Use return_cf_clearance or return_datadome_cookie when you need a specific protection cookie; for DataDome, the Better Fetch session is usually the stronger reuse primitive because cookies can be bound to IP, fingerprint, and browser state.",
  "Stored session limits are plan-based: Free 1, Starter 10, Pro 50, Scale 250; named sessions expire after 7 idle days.",
  "Requests without country skip the fresh-identity retry budget; when country is set, retries can rotate browser profile/fingerprint and escalate to headed mode, but egress IP stays the same.",
  "Check blocked and block_reason to detect bot walls even when the target returns HTTP 200. The attempts field is greater than 1 when the service retried — retries cover both blocks and transient navigation timeouts (net::ERR_TIMED_OUT).",
  "Leave user_agent, locale, and timezone unset unless required — they form part of a session's warm-context identity, so changing them splits the warm pool.",
  "First requests after a deploy can be slower while Chromium starts; reused session requests are served from a warm pool.",
  "Do not send raw proxy credentials. Better Fetch does not currently provide managed proxy routing.",
  "Use POST /v1/jobs for long-running fetches or batch fan-out: it returns a job id immediately and runs the browser work asynchronously. Poll GET /v1/jobs/{id} for the result.",
  "Jobs run under a separate concurrency budget from synchronous /v1/fetch, so they never block real-time requests.",
];
