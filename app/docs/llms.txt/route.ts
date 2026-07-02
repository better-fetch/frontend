import {
  ERRORS,
  EXAMPLES,
  GUIDES,
  JOB_RESPONSE_FIELDS,
  REQUEST_FIELDS,
  RESPONSE_FIELDS,
  TIPS,
  type Field,
} from "../content";
import { MCP_TOOLS } from "@/lib/mcp-tools";

// Full docs as one markdown file, generated from the canonical content.ts that
// /docs renders, so human and agent docs stay aligned.
function fields(title: string, list: Field[]): string {
  const rows = list
    .map(
      (f) =>
        `- \`${f.name}\` (${f.type}${f.default ? `, default ${f.default}` : ""}): ${f.description}`,
    )
    .join("\n");
  return `## ${title}\n\n${rows}\n`;
}

function build(): string {
  const examples = EXAMPLES.map(
    (e) =>
      `### ${e.title}\n\n${e.description}\n\n\`\`\`bash\n${e.code}\n\`\`\`${e.note ? `\n\n${e.note}` : ""}`,
  ).join("\n\n");

  const errors = ERRORS.map(
    (e) => `- \`${e.status}\` \`${e.code}\`: ${e.meaning}`,
  ).join("\n");

  const tips = TIPS.map((t) => `- ${t}`).join("\n");
  const guides = GUIDES.map(
    (g) =>
      `### ${g.title}\n\n${g.description}\n\n${g.points.map((p) => `- ${p}`).join("\n")}`,
  ).join("\n\n");
  const mcpTools = MCP_TOOLS.map((tool) => `- \`${tool.name}\`: ${tool.desc}`).join("\n");

  return `# Better Fetch — API reference

> Fetch any URL through a real, stealth Chromium browser. Base URL https://api.betterfetch.co, endpoints under /v1. This file is generated from the same canonical frontend docs source as https://betterfetch.co/docs.

## Authentication

All fetch requests require a bearer token: \`Authorization: Bearer <your-bf-key>\`. Create and revoke keys at https://betterfetch.co/keys. Keys require an active subscription and are metered against the plan's monthly quota; a call is counted when accepted, regardless of fetch outcome. Stored browser sessions are scoped to the authenticated account, have plan limits, and sync encrypted cookie/localStorage snapshots for multi-machine reuse.

## POST /v1/fetch

Fetch a URL through the browser and return rendered page data: target status, final URL, title, rendered HTML, headers, timing, block classification, and optionally the raw body, parsed JSON, captured network calls, or a screenshot. Only \`url\` is required; unknown request fields are rejected with 400.

\`\`\`bash
curl -sS -X POST "https://api.betterfetch.co/v1/fetch" \\
  -H "Authorization: Bearer $BETTER_FETCH_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"url": "https://example.com", "wait_until": "domcontentloaded", "timeout_ms": 60000}'
\`\`\`

${fields("Request fields", REQUEST_FIELDS)}
${fields("Response fields", RESPONSE_FIELDS)}
## Examples

${examples}

## Errors

Every non-2xx response uses one JSON envelope: \`{ "ok": false, "error": "<code>", "message": "...", "status": <n> }\`. Switch on the stable \`error\` code.

${errors}

A 200 with \`"blocked": true\` (or a target \`"status": 403\`) means Better Fetch worked but the target denied the browser request — different from an API error. Use \`block_reason\` for the category.

## Guides

${guides}

## POST /v1/jobs

Submit a fetch as a background job. Accepts the same body as POST /v1/fetch and returns 202 with a job id immediately. The browser work runs asynchronously under a separate concurrency budget so it never blocks synchronous /v1/fetch. A call is counted when the job is admitted, regardless of outcome.

\`\`\`bash
curl -sS -X POST "https://api.betterfetch.co/v1/jobs" \\
  -H "Authorization: Bearer $BETTER_FETCH_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"url": "https://example.com", "wait_until": "domcontentloaded", "timeout_ms": 60000}'

# → {"ok": true, "id": "a1b2c3d4-...", "status": "queued"}
\`\`\`

Poll the job with GET /v1/jobs/{id}. Returns the current status (queued, running, done, failed) and the full FetchSuccess result when complete. Jobs are scoped to the authenticated account.

\`\`\`bash
curl -sS "https://api.betterfetch.co/v1/jobs/a1b2c3d4-..." \\
  -H "Authorization: Bearer $BETTER_FETCH_API_KEY"
\`\`\`

${fields("Job response fields", JOB_RESPONSE_FIELDS)}
## GET /v1/sessions

List active account-scoped browser sessions without exposing cookie values. Clear one with \`DELETE /v1/sessions/<id>\`.

Session names are account-scoped but canonicalized for backend routing: only letters and numbers form the durable key today, so \`shop-us\`, \`shop_us\`, and \`shopus\` target the same stored browser session.

## GET /v1/health

Liveness check, no auth: \`curl -sS https://api.betterfetch.co/v1/health\`. The response includes the Better Fetch service \`version\`, managed proxy status under \`managed_proxy\`, and pinned browser metadata under \`browser\` (\`version\`, \`bundled_version\`, \`platform\`, \`installed\`). Add \`?geo=1&country=us\` to include the country browser geo-emulation defaults. \`?proxy=1\` is a deprecated no-op diagnostic; managed proxy routing has been removed.

## Tips

${tips}

## MCP connector

AI agents can call Better Fetch as a tool via the Model Context Protocol: remote server at https://betterfetch.co/api/mcp (OAuth sign-in as a custom connector in Claude / Claude Cowork / Claude Desktop, or \`Authorization: Bearer <your-bf-key>\`). Also available as a Claude Code plugin: \`/plugin marketplace add better-fetch/claude-plugins\`.

Tools:

${mcpTools}
`;
}

export const dynamic = "force-static";

export function GET() {
  return new Response(build(), {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
