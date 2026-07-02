import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
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
import { getClaims } from "@/lib/supabase/server";
import { getMarketplaceTool } from "@/lib/tool-catalog";
import { ToolRunner } from "./tool-runner";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const tool = getMarketplaceTool(slug);
  if (!tool) return {};
  return {
    title: tool.title,
    description: tool.shortDescription,
    alternates: { canonical: `/tools/${tool.slug}` },
  };
}

export default async function ToolDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  if (!(await getClaims())) redirect("/login");
  const { slug } = await params;
  const tool = getMarketplaceTool(slug);
  if (!tool) notFound();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" asChild>
          <Link href="/tools">Back</Link>
        </Button>
      </div>

      <section className="space-y-4">
        <div className="flex items-start gap-4">
          <ToolLogoMark className="mt-1 size-10" />
          <div className="min-w-0 space-y-2">
            <div>
              <h1 className="break-words text-3xl font-semibold tracking-tight">
                {tool.title}
              </h1>
              <p className="font-mono text-sm text-muted-foreground">
                {tool.mcpName}
              </p>
            </div>
            <p className="max-w-3xl text-muted-foreground">{tool.description}</p>
            <div className="flex flex-wrap gap-2">
              {tool.categories.map((category) => (
                <Badge key={category} variant="secondary">
                  {category}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_18rem]">
        <ToolRunner slug={tool.slug} />

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Tool</CardTitle>
              <CardDescription>
                Better Fetch product metadata for dashboard and MCP usage.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Metric label="Pricing" value={tool.pricing} />
              <Metric label="Delivery" value={tool.delivery} />
              <Metric label="Inputs" value={tool.inputHighlights.join(", ")} />
            </CardContent>
            <CardFooter>
              <span className="text-xs text-muted-foreground">
                Discovered {tool.discoveredAt}
              </span>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>MCP</CardTitle>
              <CardDescription>Available as a remote MCP tool.</CardDescription>
            </CardHeader>
            <CardContent>
              <code className="font-mono text-sm">{tool.mcpName}</code>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b pb-2 last:border-b-0 last:pb-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}
