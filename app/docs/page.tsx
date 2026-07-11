import type { Metadata } from "next";
import { CodeBlock } from "@/components/code-block";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ERRORS,
  EXAMPLES,
  GUIDES,
  JOB_RESPONSE_FIELDS,
  REQUEST_FIELDS,
  RESPONSE_FIELDS,
  TIPS,
  type Field,
} from "./content";
import { DocsSidebar, type NavItem } from "./sidebar";
import { MCP_TOOLS } from "@/lib/mcp-tools";

export const metadata: Metadata = {
  title: "Docs",
  description: "Better Fetch API reference: fetch any URL through a real browser.",
  alternates: { canonical: "/docs" },
};

const NAV: NavItem[] = [
  { id: "overview", title: "Overview" },
  { id: "authentication", title: "Authentication" },
  { id: "fetch", title: "POST /v1/fetch" },
  { id: "request-fields", title: "Request fields" },
  { id: "response-fields", title: "Response fields" },
  {
    id: "examples",
    title: "Examples",
    children: EXAMPLES.map((e) => ({ id: e.id, title: e.title })),
  },
  { id: "errors", title: "Errors" },
  {
    id: "guides",
    title: "Guides",
    children: GUIDES.map((g) => ({ id: g.id, title: g.title })),
  },
  { id: "jobs", title: "POST /v1/jobs" },
  { id: "sessions", title: "GET /v1/sessions" },
  { id: "health", title: "GET /v1/health" },
  { id: "mcp-tools", title: "MCP tools" },
  { id: "tips", title: "Tips" },
];

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20 space-y-3 border-b pb-8">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      {children}
    </section>
  );
}

function FieldList({ fields }: { fields: Field[] }) {
  return (
    <div className="divide-y rounded-lg border">
      {fields.map((field) => (
        <div key={field.name} className="space-y-1 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <code className="font-mono text-sm font-medium">{field.name}</code>
            <Badge variant="outline" className="font-mono text-[11px]">
              {field.type}
            </Badge>
            {field.default ? (
              <span className="text-xs text-muted-foreground">
                default: <code className="font-mono">{field.default}</code>
              </span>
            ) : null}
          </div>
          <p className="text-sm text-muted-foreground">{field.description}</p>
        </div>
      ))}
    </div>
  );
}

export default function DocsPage() {
  return (
    <div className="lg:grid lg:grid-cols-[200px_1fr] lg:gap-10">
      <aside className="hidden lg:block">
        <div className="sticky top-20">
          <DocsSidebar items={NAV} />
        </div>
      </aside>

      <div className="min-w-0 space-y-8">
        <Section id="overview" title="Overview">
          <p className="text-sm leading-relaxed text-muted-foreground">
            Better Fetch fetches URLs through a real, stealth Chromium browser.
            Use it when a target needs JavaScript rendering, browser
            geo-emulation, account-scoped sticky sessions, screenshots, network
            capture, or Cloudflare/DataDome cookie collection when issued. The
            base URL is{" "}
            <code className="font-mono text-foreground">
              https://api.betterfetch.co
            </code>{" "}
            and endpoints are versioned under{" "}
            <code className="font-mono text-foreground">/v1</code>.
          </p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Every request runs in a real browser profile — not incognito.
            Requests with a <code className="font-mono">session</code> reuse a
            warm, pooled context keyed to your account, session, and browser
            options. If a response looks blocked and{" "}
            <code className="font-mono">country</code> is set, the service can
            retry on a fresh browser identity and escalate to a headed browser;
            network egress IP does not change.
          </p>
        </Section>

        <Section id="authentication" title="Authentication">
          <p className="text-sm leading-relaxed text-muted-foreground">
            All fetch requests require a bearer token. Create and revoke keys
            on the <a href="/keys" className="underline">API keys</a> page.
            Keep keys server-side — never in browser JavaScript, query strings,
            or shared logs.
          </p>
          <CodeBlock>{`Authorization: Bearer <your-api-key>
Content-Type: application/json`}</CodeBlock>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Keys require an active subscription and are metered against your
            plan&apos;s monthly quota. A call is counted when it is accepted,
            regardless of the fetch outcome. Stored browser sessions are also
            plan-limited and can be cleared from the dashboard.
          </p>
        </Section>

        <Section id="fetch" title="POST /v1/fetch">
          <div className="flex items-center gap-2">
            <Badge>POST</Badge>
            <code className="font-mono text-sm">/v1/fetch</code>
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Fetch a URL through the browser and return rendered page data:
            target status, final URL, title, rendered HTML, headers, timing,
            block classification, and optionally the raw body, parsed JSON,
            captured network calls, or a screenshot. Unknown request fields are
            rejected with <code className="font-mono">400</code>.
          </p>
          <CodeBlock>{`curl -sS -X POST "https://api.betterfetch.co/v1/fetch" \\
  -H "Authorization: Bearer $BETTER_FETCH_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "url": "https://example.com",
    "wait_until": "domcontentloaded",
    "timeout_ms": 60000
  }'`}</CodeBlock>
        </Section>

        <Section id="request-fields" title="Request fields">
          <p className="text-sm text-muted-foreground">
            Only <code className="font-mono">url</code> is required. Everything
            else has a sensible default.
          </p>
          <FieldList fields={REQUEST_FIELDS} />
        </Section>

        <Section id="response-fields" title="Response fields">
          <p className="text-sm leading-relaxed text-muted-foreground">
            <code className="font-mono">ok: true</code> means Better Fetch
            completed the browser request — check{" "}
            <code className="font-mono">status</code> and{" "}
            <code className="font-mono">blocked</code> /{" "}
            <code className="font-mono">block_reason</code> for the
            target&apos;s verdict.
          </p>
          <FieldList fields={RESPONSE_FIELDS} />
        </Section>

        <Section id="examples" title="Examples">
          <div className="space-y-8">
            {EXAMPLES.map((example) => (
              <div
                key={example.id}
                id={example.id}
                className="scroll-mt-20 space-y-2"
              >
                <h3 className="font-medium">{example.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {example.description}
                </p>
                <CodeBlock>{example.code}</CodeBlock>
                {example.note ? (
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {example.note}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </Section>

        <Section id="errors" title="Errors">
          <p className="text-sm leading-relaxed text-muted-foreground">
            Every non-2xx response uses a single JSON envelope. Switch on the
            stable <code className="font-mono">error</code> code, not the
            message.
          </p>
          <CodeBlock>{`{ "ok": false, "error": "unauthorized", "message": "invalid or missing bearer token", "status": 401 }`}</CodeBlock>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Status</TableHead>
                <TableHead className="w-44">Code</TableHead>
                <TableHead>Meaning</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ERRORS.map((error) => (
                <TableRow key={error.code}>
                  <TableCell>{error.status}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {error.code}
                  </TableCell>
                  <TableCell className="whitespace-normal text-muted-foreground">
                    {error.meaning}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Target errors are different from API errors: if Better Fetch
            returns HTTP 200 and the JSON contains{" "}
            <code className="font-mono">&quot;status&quot;: 403</code> or{" "}
            <code className="font-mono">&quot;blocked&quot;: true</code>, the
            API worked and the target denied the browser request; use{" "}
            <code className="font-mono">block_reason</code> for the category.
          </p>
        </Section>

        <Section id="guides" title="Guides">
          {GUIDES.map((guide) => (
            <div key={guide.id} id={guide.id} className="scroll-mt-20 space-y-2">
              <h3 className="font-medium">{guide.title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {guide.description}
              </p>
              <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">
                {guide.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </div>
          ))}
        </Section>

        <Section id="jobs" title="POST /v1/jobs">
          <div className="flex items-center gap-2">
            <Badge>POST</Badge>
            <code className="font-mono text-sm">/v1/jobs</code>
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Submit a fetch as a background job. Accepts the same body as{" "}
            <code className="font-mono">POST /v1/fetch</code> and returns{" "}
            <code className="font-mono">202</code> with a job id immediately.
            The browser work runs asynchronously under a separate concurrency
            budget, so it never blocks synchronous{" "}
            <code className="font-mono">/v1/fetch</code> traffic.
          </p>
          <CodeBlock>{`curl -sS -X POST "https://api.betterfetch.co/v1/jobs" \\
  -H "Authorization: Bearer $BETTER_FETCH_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "url": "https://example.com",
    "wait_until": "domcontentloaded",
    "timeout_ms": 60000
  }'

# → {"ok": true, "id": "a1b2c3d4-...", "status": "queued"}`}</CodeBlock>
          <div className="flex items-center gap-2 pt-2">
            <Badge variant="secondary">GET</Badge>
            <code className="font-mono text-sm">/v1/jobs/{"{id}"}</code>
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Poll a job. Returns the current status (
            <code className="font-mono">queued</code>,{" "}
            <code className="font-mono">running</code>,{" "}
            <code className="font-mono">done</code>,{" "}
            <code className="font-mono">failed</code>) and the full result when
            complete. Jobs are scoped to the authenticated account.
          </p>
          <CodeBlock>{`curl -sS "https://api.betterfetch.co/v1/jobs/a1b2c3d4-..." \\
  -H "Authorization: Bearer $BETTER_FETCH_API_KEY"`}</CodeBlock>
          <p className="text-sm text-muted-foreground">
            <code className="font-mono">result</code> contains the same{" "}
            <code className="font-mono">FetchSuccess</code> shape as{" "}
            <code className="font-mono">/v1/fetch</code>. A call is counted when
            the job is admitted, regardless of outcome.
          </p>
          <FieldList fields={JOB_RESPONSE_FIELDS} />
        </Section>

        <Section id="sessions" title="GET /v1/sessions">
          <div className="flex items-center gap-2">
            <Badge variant="secondary">GET</Badge>
            <code className="font-mono text-sm">/v1/sessions</code>
          </div>
          <p className="text-sm text-muted-foreground">
            List active account-scoped browser sessions without exposing cookie
            values. Clear one with{" "}
            <code className="font-mono">DELETE /v1/sessions/&lt;id&gt;</code>.
          </p>
          <p className="text-sm text-muted-foreground">
            Session names are account-scoped but canonicalized for backend
            routing: only letters and numbers form the durable key today. For
            example, <code className="font-mono">shop-us</code>,{" "}
            <code className="font-mono">shop_us</code>, and{" "}
            <code className="font-mono">shopus</code> target the same stored
            browser session.
          </p>
          <CodeBlock>{`curl -sS "https://api.betterfetch.co/v1/sessions" \\
  -H "Authorization: Bearer $BETTER_FETCH_API_KEY"

curl -sS -X DELETE "https://api.betterfetch.co/v1/sessions/<id>" \\
  -H "Authorization: Bearer $BETTER_FETCH_API_KEY"`}</CodeBlock>
        </Section>

        <Section id="health" title="GET /v1/health">
          <div className="flex items-center gap-2">
            <Badge variant="secondary">GET</Badge>
            <code className="font-mono text-sm">/v1/health</code>
          </div>
          <p className="text-sm text-muted-foreground">
            Liveness check. No authentication required.
          </p>
          <CodeBlock>{`curl -sS "https://api.betterfetch.co/v1/health"
curl -sS "https://api.betterfetch.co/v1/health?geo=1&country=us"

{
  "ok": true,
  "version": "0.4.0",
  "browser": {
    "version": "146.0.7680.177.5",
    "bundled_version": "146.0.7680.177.5",
    "platform": "linux-x64",
    "installed": true
  },
  "managed_proxy": {
    "enabled": true,
    "provider": "configured",
    "message": "Use proxy=auto for direct-first escalation or proxy=residential for every attempt."
  },
  "geo_emulation": {
    "ok": true,
    "status": "geo_emulation",
    "country": "us",
    "timezone": "America/New_York",
    "locale": "en-US",
    "egress_ip_changed": false,
    "message": "country sets browser timezone/locale defaults only"
  },
  "pool_size": 2,
  "pool_max": 4
}`}</CodeBlock>
        </Section>

        <Section id="mcp-tools" title="MCP tools">
          <p className="text-sm leading-relaxed text-muted-foreground">
            The remote MCP server lives at{" "}
            <code className="font-mono">https://betterfetch.co/api/mcp</code>.
            Claude-style OAuth connectors can sign in without handling a key;
            manual MCP clients can send{" "}
            <code className="font-mono">Authorization: Bearer bf_...</code>.
            Browser fetch tool calls are metered like REST fetch calls.
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-44">Tool</TableHead>
                <TableHead>Contract</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {MCP_TOOLS.map((tool) => (
                <TableRow key={tool.name}>
                  <TableCell className="font-mono text-xs">
                    {tool.name}
                  </TableCell>
                  <TableCell className="whitespace-normal text-muted-foreground">
                    {tool.desc}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Section>

        <section id="tips" className="scroll-mt-20 space-y-3 pb-8">
          <h2 className="text-xl font-semibold tracking-tight">Tips</h2>
          <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">
            {TIPS.map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
          <p className="text-sm text-muted-foreground">
            This frontend page is the canonical API reference. The same content
            is also available as{" "}
            <a href="/docs/llms.txt" className="underline">
              markdown for agents
            </a>
            . Legacy API-served schema/reference endpoints may exist for
            compatibility, but they are not the source of truth.
          </p>
        </section>
      </div>
    </div>
  );
}
