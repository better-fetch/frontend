// Root llms.txt (llmstxt.org spec): a curated, link-based map for LLM agents.
import { MCP_TOOLS } from "@/lib/mcp-tools";
import {
  categoryLabel,
  getToolCategories,
  toolMetaDescription,
} from "@/lib/tool-display";
import { getLiveTools } from "@/lib/tools-registry";

const MCP_TOOL_LIST = MCP_TOOLS.map((tool) => `\`${tool.name}\``).join(", ");

const body = (liveToolList: string) => `# Better Fetch

> Better Fetch is the web data layer for AI agents: a hosted MCP connector that gives Claude, ChatGPT, Codex, and other clients reliable retrieval through direct HTTP, real Chromium, persistent browser sessions, structured extraction, API discovery, screenshots, and optional residential routing. The same engine is available at https://api.betterfetch.co/v1 for direct API use.

Use a two-letter \`country\` for coherent browser locale/timezone defaults. It changes network egress only when \`proxy\` is \`auto\` or \`residential\`. Use \`proxy: "auto"\` for the cost-aware path: direct first, residential only after a block. Use a stable \`session\` to reuse one account-scoped warm browser context, fingerprint, cookies, and localStorage. A call is counted when accepted, regardless of fetch outcome.

Check \`GET /v1/health?geo=1&country=us\` to see browser identity defaults and current managed-proxy availability.

Use \`cache_ttl_ms\` only for explicit short scraper bursts that repeat the same synchronous fetch payload. It defaults to 0/off, is best effort per API worker, and \`cache_status\` reports \`bypass\`, \`miss\`, \`hit\`, or \`coalesced\`.

Session names are account-scoped but canonicalized for backend routing: only letters and numbers form the durable session key, so \`shop-us\`, \`shop_us\`, and \`shopus\` target the same stored browser session today.

## Docs

- [API reference](https://betterfetch.co/docs): canonical human-readable docs for POST /v1/fetch
- [Docs as markdown](https://betterfetch.co/docs/llms.txt): canonical full request/response fields, examples, errors, tips for agents

## Integrations

- [MCP setup](https://betterfetch.co/mcp): add the Streamable HTTP server to Claude or ChatGPT desktop and sign in with OAuth; Codex CLI/IDE use the same endpoint and OAuth flow. API-key auth remains available for unattended clients.
- MCP tools: ${MCP_TOOL_LIST}
- [Claude Code plugin marketplace](https://github.com/better-fetch/claude-plugins): skills + MCP server; /plugin marketplace add better-fetch/claude-plugins
- [Tool catalogue](https://betterfetch.co/tools): ready-made tools built on the engine. Over MCP, call \`search_tools\` then \`run_tool\`; over REST, POST https://betterfetch.co/api/tools/{name}/run${liveToolList}

## Optional

- [Pricing](https://betterfetch.co/#pricing): free (50 calls) / starter / pro / scale
- [API keys dashboard](https://betterfetch.co/keys): create/revoke keys and clear stored browser sessions
`;

export const dynamic = "force-static";
// Re-render periodically so newly published marketplace tools show up.
export const revalidate = 3600;

export async function GET() {
  const tools = await getLiveTools({ force: true }).catch(() => []);
  const categories = getToolCategories(tools);
  const liveToolList = categories.length
    ? `\n\n## Live marketplace tools\n\n${categories
        .map(
          (category) =>
            `### ${categoryLabel(category.slug)}\n` +
            category.tools
              .map(
                (tool) =>
                  `- [${tool.title}](https://betterfetch.co/tools/${tool.name}) (` +
                  `\`${tool.name}\`, ${tool.credits_estimate} credit${tool.credits_estimate === 1 ? "" : "s"}/run): ` +
                  `${toolMetaDescription(tool)} ` +
                  `MCP: \`run_tool\` with name \`${tool.name}\`; REST: \`POST https://betterfetch.co/api/tools/${tool.name}/run\`; ` +
                  `tool llms.txt: https://betterfetch.co/tools/${tool.name}/llms.txt`,
              )
              .join("\n"),
        )
        .join("\n\n")}`
    : "";
  return new Response(body(liveToolList), {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
