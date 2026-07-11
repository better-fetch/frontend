import type { Metadata } from "next";
import Link from "next/link";
import { AgentInstallTabs } from "@/components/agent-install-tabs";
import { CodeBlock } from "@/components/code-block";
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
import { getLiveTools } from "@/lib/tools-registry";

export const metadata: Metadata = {
  title: "Connect Better Fetch to Claude and ChatGPT",
  description:
    "Add Better Fetch to Claude, ChatGPT desktop, or Codex with one hosted MCP connector. OAuth sign-in, no local browser service, and 50 free calls each month.",
  alternates: { canonical: "/mcp" },
};

const MCP_URL = "https://betterfetch.co/api/mcp";

const API_KEY_CONFIG = `[mcp_servers.better_fetch]
url = "https://betterfetch.co/api/mcp"
bearer_token_env_var = "BETTER_FETCH_API_KEY"
tool_timeout_sec = 260`;

export default async function McpPage() {
  const liveTools = await getLiveTools({ force: true }).catch(() => []);

  return (
    <div className="space-y-14">
      <section className="space-y-6 text-center">
        <div className="space-y-3">
          <p className="text-xs font-medium uppercase tracking-wider text-primary">
            Hosted MCP connector
          </p>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
            Give your AI a better fetch.
          </h1>
          <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
            One connection gives Claude and ChatGPT browser-grade retrieval,
            structured extraction, sticky sessions, API discovery, screenshots,
            regional routing, and {liveTools.length} ready-made web tools.
          </p>
        </div>
        <AgentInstallTabs />
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Hosted</CardTitle>
            <CardDescription>
              No Playwright, browser binary, proxy, or local daemon to install.
              Better Fetch runs the retrieval layer for the model.
            </CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>OAuth first</CardTitle>
            <CardDescription>
              Sign in with your Better Fetch account. The connection creates a
              revocable key without exposing it in chat or configuration.
            </CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Cost-aware</CardTitle>
            <CardDescription>
              The server tells the agent to start cheaply, reuse sessions,
              avoid blind retries, and escalate routing only when necessary.
            </CardDescription>
          </CardHeader>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>A compact tool surface</CardTitle>
          <CardDescription>
            Core retrieval primitives stay directly available. The growing
            catalogue is searched on demand, so the model does not have to choose
            among dozens of specialist schemas on every turn.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-44">Tool</TableHead>
                <TableHead>What it does</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {MCP_TOOLS.map((tool) => (
                <TableRow key={tool.name}>
                  <TableCell className="font-mono text-xs">{tool.name}</TableCell>
                  <TableCell className="whitespace-normal text-muted-foreground">
                    {tool.desc}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Use an API key instead</CardTitle>
          <CardDescription>
            OAuth is the recommended path. For unattended Codex environments or
            clients without OAuth, create a <code className="font-mono">bf_</code> key
            and read it from an environment variable.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <CodeBlock>{API_KEY_CONFIG}</CodeBlock>
          <p className="text-xs text-muted-foreground">
            Server URL: <code className="font-mono">{MCP_URL}</code>. Keep API keys
            out of committed config and chat transcripts.
          </p>
        </CardContent>
      </Card>

      <div className="flex flex-wrap justify-center gap-2">
        <Button asChild>
          <Link href="/tools">Browse ready-made tools</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/plugin">Claude Code skills and subagent</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/docs">REST API reference</Link>
        </Button>
      </div>
    </div>
  );
}
