"use client";

import Image from "next/image";
import Link from "next/link";
import { CodeBlock } from "@/components/code-block";
import { CopyField } from "@/components/copy-button";
import { Button } from "@/components/ui/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

const MCP_URL = "https://betterfetch.co/api/mcp";

const CLAUDE_PLUGIN = `/plugin marketplace add better-fetch/claude-plugins
/plugin install better-fetch@better-fetch`;

const CHATGPT_CODEX = `codex mcp add better-fetch --url https://betterfetch.co/api/mcp
codex mcp login better-fetch`;

export function AgentInstallTabs({ className }: { className?: string }) {
  return (
    <Tabs
      defaultValue="claude"
      className={cn("mx-auto w-full max-w-2xl", className)}
    >
      <TabsList className="h-11 w-fit justify-start p-1">
        <TabsTrigger value="claude" className="flex-none gap-2 px-4 text-sm">
          <Image
            src="/claude-symbol.svg"
            alt=""
            width={18}
            height={18}
            aria-hidden
            className="size-[18px]"
          />
          Add to Claude
        </TabsTrigger>
        <TabsTrigger value="chatgpt" className="flex-none gap-2 px-4 text-sm">
          <Image
            src="/chatgpt-symbol.svg"
            alt=""
            width={18}
            height={18}
            aria-hidden
            className="size-[18px] dark:invert"
          />
          Add to ChatGPT
        </TabsTrigger>
      </TabsList>

      <TabsContent value="claude" className="mt-2">
        <div className="rounded-xl border bg-card p-5 text-left shadow-sm sm:p-6">
          <div className="space-y-1">
            <h3 className="font-semibold">Connect with your Better Fetch account</h3>
            <p className="text-sm text-muted-foreground">
              In Claude, open <strong className="text-foreground">Settings → Connectors</strong>,
              add a custom connector, paste this URL, then sign in. No API key to copy.
            </p>
          </div>
          <div className="mt-4">
            <CopyField value={MCP_URL} />
          </div>
          <div className="mt-5 border-t pt-5">
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Claude Code power user
            </p>
            <CodeBlock>{CLAUDE_PLUGIN}</CodeBlock>
            <p className="mt-2 text-xs text-muted-foreground">
              Adds retrieval skills and a scraper subagent alongside the MCP connector.
            </p>
          </div>
        </div>
      </TabsContent>

      <TabsContent value="chatgpt" className="mt-2">
        <div className="rounded-xl border bg-card p-5 text-left shadow-sm sm:p-6">
          <div className="space-y-1">
            <h3 className="font-semibold">Connect from ChatGPT desktop</h3>
            <p className="text-sm text-muted-foreground">
              Open <strong className="text-foreground">Settings → MCP servers → Add server</strong>,
              choose Streamable HTTP, paste this URL, save, then authenticate and restart.
            </p>
          </div>
          <div className="mt-4">
            <CopyField value={MCP_URL} />
          </div>
          <div className="mt-5 border-t pt-5">
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Codex CLI or IDE
            </p>
            <CodeBlock>{CHATGPT_CODEX}</CodeBlock>
            <p className="mt-2 text-xs text-muted-foreground">
              The same MCP configuration is shared by ChatGPT desktop, Codex CLI, and the Codex IDE extension.
            </p>
          </div>
        </div>
      </TabsContent>

      <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground">
        <span>OAuth sign-in</span>
        <span aria-hidden>·</span>
        <span>50 free calls each month</span>
        <span aria-hidden>·</span>
        <Button variant="link" size="sm" className="h-auto p-0 text-xs" asChild>
          <Link href="/mcp">Full setup guide</Link>
        </Button>
      </div>
    </Tabs>
  );
}
