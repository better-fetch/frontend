import type { Metadata } from "next";
import Link from "next/link";
import { CopyButton, CopyField } from "@/components/copy-button";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MCP_TOOLS } from "@/lib/mcp-tools";

export const metadata: Metadata = {
  title: "MCP connector",
  description:
    "Connect Better Fetch to AI models via the Model Context Protocol. One-click OAuth connector for Claude and Claude Cowork, or a remote server for Claude Code, Cursor, and other MCP clients.",
  alternates: { canonical: "/mcp" },
};

const MCP_URL = "https://betterfetch.co/api/mcp";

const REMOTE_CONFIG = `{
  "mcpServers": {
    "better-fetch": {
      "type": "http",
      "url": "${MCP_URL}",
      "headers": { "Authorization": "Bearer bf_your_key_here" }
    }
  }
}`;

const CLI = `claude mcp add --transport http better-fetch ${MCP_URL} \\
  --header "Authorization: Bearer bf_your_key_here"`;

function CodeBlock({ children }: { children: string }) {
  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded-lg border bg-muted/50 p-4 pr-12 font-mono text-xs leading-relaxed">
        {children}
      </pre>
      <div className="absolute right-2 top-2">
        <CopyButton value={children} />
      </div>
    </div>
  );
}

function StepBadge({ n }: { n: number }) {
  return (
    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary font-mono text-xs font-semibold text-primary-foreground">
      {n}
    </span>
  );
}

export default function McpPage() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">MCP connector</h1>
        <p className="text-muted-foreground">
          Give any AI model browser-grade fetching as a tool, via the{" "}
          <a
            href="https://modelcontextprotocol.io"
            className="underline"
            rel="noopener"
          >
            Model Context Protocol
          </a>
          . Sign in with OAuth from Claude or Claude Cowork, or authenticate
          with an API key — browser fetch tool calls are metered against your
          plan like the REST API.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold tracking-tight">
          Claude &amp; Claude Cowork — three steps, no key
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <StepBadge n={1} /> Open connector settings
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              In Claude or Claude Cowork, go to{" "}
              <strong className="text-foreground">
                Settings → Connectors → Add custom connector
              </strong>
              . Works on claude.ai, Claude Desktop, and mobile.
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <StepBadge n={2} /> Paste the server URL
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <CopyField value={MCP_URL} />
              <p className="text-sm text-muted-foreground">
                That&apos;s the only field the connector needs.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <StepBadge n={3} /> Connect &amp; sign in
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Click <strong className="text-foreground">Connect</strong>, sign
              in with your Better Fetch email, and approve the consent screen.
              The tools below appear in your chats immediately.
            </CardContent>
          </Card>
        </div>
        <p className="text-sm text-muted-foreground">
          Connecting creates a key named &ldquo;Claude (MCP connector)&rdquo; on
          your <Link href="/keys" className="underline">keys page</Link>; revoke
          it there to disconnect at any time.
        </p>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Remote server (API key)</CardTitle>
          <CardDescription>
            The same endpoint (Streamable HTTP) also accepts your API key
            directly — handy for Claude Code, Cursor, and other clients you
            configure by hand. Need a key?{" "}
            <Link href="/keys" className="underline">
              Create one
            </Link>{" "}
            (it starts with <code className="font-mono">bf_</code>).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm font-medium">Config (Claude Code, .mcp.json)</p>
            <CodeBlock>{REMOTE_CONFIG}</CodeBlock>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Or via the CLI</p>
            <CodeBlock>{CLI}</CodeBlock>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tools</CardTitle>
          <CardDescription>
            Using Claude Code? The{" "}
            <Link href="/plugin" className="underline">
              plugin
            </Link>{" "}
            adds these plus nine skills and a scraper subagent in one command.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-40">Tool</TableHead>
                <TableHead>What it does</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {MCP_TOOLS.map((t) => (
                <TableRow key={t.name}>
                  <TableCell className="font-mono text-xs">{t.name}</TableCell>
                  <TableCell className="whitespace-normal text-muted-foreground">
                    {t.desc}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button asChild>
          <Link href="/plugin">Or install the Claude Code plugin →</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/docs">API reference</Link>
        </Button>
      </div>
    </div>
  );
}
