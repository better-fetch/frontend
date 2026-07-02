// Root llms.txt (llmstxt.org spec): a curated, link-based map for LLM agents.
import { MCP_TOOLS } from "@/lib/mcp-tools";

const MCP_TOOL_LIST = MCP_TOOLS.map((tool) => `\`${tool.name}\``).join(", ");

const BODY = `# Better Fetch

> Better Fetch is an HTTP API that fetches any URL through a real, stealth Chromium browser — JavaScript rendering, browser geo-emulation, account-scoped sticky sessions, encrypted portable cookie/localStorage snapshots, screenshots, network and stream capture, and Cloudflare/DataDome cookie collection when the target issues those cookies, in one call. Base URL: https://api.betterfetch.co (endpoints under /v1). Auth: bearer token ("bf_..." key); fetch calls are metered against a monthly plan quota and stored browser sessions have plan limits.

Use a two-letter \`country\` for browser geo-emulation: when \`geoip\` is true and \`locale\` / \`timezone\` are omitted, Better Fetch applies representative defaults for that country. It does not change network egress IP or bypass IP-based geo-restrictions. Use a \`session\` to reuse one account-scoped warm browser context, fingerprint, cookies, and localStorage. Named sessions also sync encrypted cookie/localStorage snapshots so another backend machine can hydrate the browser state. A call is counted when accepted, regardless of fetch outcome.

Check \`GET /v1/health?geo=1&country=us\` to see the country defaults. \`GET /v1/health?proxy=1\` is a deprecated no-op diagnostic; managed proxy routing has been removed.

Use \`cache_ttl_ms\` only for explicit short scraper bursts that repeat the same synchronous fetch payload. It defaults to 0/off, is best effort per API worker, and \`cache_status\` reports \`bypass\`, \`miss\`, \`hit\`, or \`coalesced\`.

Session names are account-scoped but canonicalized for backend routing: only letters and numbers form the durable session key, so \`shop-us\`, \`shop_us\`, and \`shopus\` target the same stored browser session today.

## Docs

- [API reference](https://betterfetch.co/docs): canonical human-readable docs for POST /v1/fetch
- [Docs as markdown](https://betterfetch.co/docs/llms.txt): canonical full request/response fields, examples, errors, tips for agents

## Integrations

- [MCP connector](https://betterfetch.co/api/mcp): remote Model Context Protocol server (Streamable HTTP). Supports OAuth sign-in (add as a custom connector in Claude / Claude Cowork / Claude Desktop) or "Authorization: Bearer <your-bf-key>"
- MCP tools: ${MCP_TOOL_LIST}
- [Claude Code plugin marketplace](https://github.com/better-fetch/claude-plugins): skills + MCP server; /plugin marketplace add better-fetch/claude-plugins

## Optional

- [Pricing](https://betterfetch.co/#pricing): free (50 calls) / starter / pro / scale
- [API keys dashboard](https://betterfetch.co/keys): create/revoke keys and clear stored browser sessions
`;

export const dynamic = "force-static";

export function GET() {
  return new Response(BODY, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
