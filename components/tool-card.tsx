import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ToolLogo } from "@/components/tool-logo";
import {
  categoryLabel,
  toolExampleValue,
  toolOutputFields,
} from "@/lib/tool-display";
import type { RegistryTool } from "@/lib/tools-registry";

export function ToolCard({ tool }: { tool: RegistryTool }) {
  const returns = toolOutputFields(tool);
  const example = toolExampleValue(tool);

  return (
    <Link
      href={`/tools/${tool.name}`}
      className="group rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Card className="flex h-full flex-col gap-4 p-5 transition group-hover:ring-primary/30 group-hover:bg-card/80">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <ToolLogo tool={tool} size="md" />
            <Badge variant="secondary" className="shrink-0">
              {categoryLabel(tool.category)}
            </Badge>
          </div>
          <div className="space-y-1">
            <h3 className="font-heading font-semibold leading-tight tracking-tight">
              {tool.title}
            </h3>
            <p className="line-clamp-2 text-sm text-muted-foreground">
              {tool.description}
            </p>
          </div>
        </div>

        {returns.length > 0 ? (
          <div className="space-y-1.5">
            <span className="text-[0.7rem] font-medium uppercase tracking-wide text-muted-foreground">
              Returns
            </span>
            <div className="flex flex-wrap gap-1.5">
              {returns.map((field) => (
                <code
                  key={field}
                  className="rounded-md bg-muted/60 px-1.5 py-0.5 font-mono text-xs text-foreground/80"
                >
                  {field}
                </code>
              ))}
            </div>
          </div>
        ) : null}

        {example ? (
          <div className="flex items-baseline gap-2 text-xs">
            <span className="shrink-0 font-medium uppercase tracking-wide text-[0.7rem] text-muted-foreground">
              Example
            </span>
            <span className="truncate font-mono text-foreground/70">
              {example}
            </span>
          </div>
        ) : null}

        <div className="mt-auto space-y-2">
          <div className="flex items-center justify-between border-t pt-3 text-sm">
            <span className="text-xs text-muted-foreground">
              ~{tool.credits_estimate} credit{tool.credits_estimate === 1 ? "" : "s"}/run
            </span>
            <span className="flex shrink-0 items-center gap-1 font-medium text-primary">
              View
              <ArrowRight className="size-4 transition group-hover:translate-x-0.5" />
            </span>
          </div>
        </div>
      </Card>
    </Link>
  );
}
