import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ToolLogoMark } from "@/components/tool-logo-mark";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { MARKETPLACE_TOOLS } from "@/lib/tool-catalog";
import { getClaims } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Tools",
  description:
    "Better Fetch scraper tools available from the dashboard and MCP connector.",
  alternates: { canonical: "/tools" },
};

export default async function ToolsPage() {
  if (!(await getClaims())) redirect("/login");

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Tools</h1>
        <p className="text-muted-foreground">
          Scraper products exposed in the dashboard and over MCP.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {MARKETPLACE_TOOLS.map((tool) => (
          <Card key={tool.slug} className="@container/tool-card h-full">
            <CardHeader>
              <div className="flex items-start gap-3">
                <ToolLogoMark className="mt-0.5" />
                <div className="min-w-0 space-y-1">
                  <CardTitle className="break-words">{tool.title}</CardTitle>
                  <CardDescription className="font-mono text-xs">
                    {tool.mcpName}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-4">
              <p className="text-sm text-muted-foreground">
                {tool.shortDescription}
              </p>
              <div className="grid gap-2 text-sm @md/tool-card:grid-cols-2">
                <div>
                  <div className="text-muted-foreground">Pricing</div>
                  <div>{tool.pricing}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Delivery</div>
                  <div>{tool.delivery}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Inputs</div>
                  <div>{tool.inputHighlights.slice(0, 2).join(", ")}</div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {tool.categories.map((category) => (
                  <Badge key={category} variant="secondary">
                    {category}
                  </Badge>
                ))}
              </div>
            </CardContent>
            <CardFooter className="justify-between gap-3">
              <span className="text-xs text-muted-foreground">
                Better Fetch tool
              </span>
              <Button asChild>
                <Link href={`/tools/${tool.slug}`}>Open</Link>
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  );
}
