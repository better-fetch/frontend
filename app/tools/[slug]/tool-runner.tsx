"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type RunState =
  | { status: "idle" }
  | { status: "running" }
  | { status: "done"; body: unknown }
  | { status: "error"; message: string };

export function ToolRunner({ slug }: { slug: string }) {
  if (slug === "sitemap-url-extractor") {
    return <SitemapUrlExtractorRunner slug={slug} />;
  }
  if (slug === "rss-feed-reader") {
    return <RssFeedReaderRunner slug={slug} />;
  }
  if (slug === "website-logo-extractor") {
    return <WebsiteLogoExtractorRunner slug={slug} />;
  }
  return <WebsiteContentCrawlerRunner slug={slug} />;
}

function WebsiteContentCrawlerRunner({ slug }: { slug: string }) {
  const [state, setState] = useState<RunState>({ status: "idle" });
  const [includeHtml, setIncludeHtml] = useState(false);

  async function runTool(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState({ status: "running" });
    const form = new FormData(event.currentTarget);
    const startUrls = String(form.get("start_urls") ?? "")
      .split(/\r?\n/)
      .map((url) => url.trim())
      .filter(Boolean);

    const payload = {
      start_urls: startUrls,
      max_pages: Number(form.get("max_pages") || 5),
      max_depth: Number(form.get("max_depth") || 1),
      scope: String(form.get("scope") || "path"),
      output_format: String(form.get("output_format") || "markdown"),
      strategy: String(form.get("strategy") || "auto"),
      include_html: includeHtml,
    };

    try {
      const response = await fetch(`/api/tools/${slug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setState({
          status: "error",
          message: body?.error ?? `Run failed (${response.status})`,
        });
        return;
      }
      setState({ status: "done", body });
    } catch {
      setState({ status: "error", message: "Run failed. Check your connection." });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Run</CardTitle>
        <CardDescription>Runs use your Better Fetch account.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={runTool} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="start_urls">Start URLs</Label>
            <textarea
              id="start_urls"
              name="start_urls"
              required
              rows={4}
              className="min-h-28 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              placeholder="https://example.com/docs"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="max_pages">Max pages</Label>
              <Input
                id="max_pages"
                name="max_pages"
                type="number"
                min={1}
                max={25}
                defaultValue={5}
                inputMode="numeric"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="max_depth">Max depth</Label>
              <Input
                id="max_depth"
                name="max_depth"
                type="number"
                min={0}
                max={4}
                defaultValue={1}
                inputMode="numeric"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="scope">Scope</Label>
              <select
                id="scope"
                name="scope"
                defaultValue="path"
                className="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="path">Path</option>
                <option value="origin">Origin</option>
                <option value="page">Page</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="output_format">Output</Label>
              <select
                id="output_format"
                name="output_format"
                defaultValue="markdown"
                className="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="markdown">Markdown</option>
                <option value="text">Text</option>
                <option value="html">HTML</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="strategy">Strategy</Label>
              <select
                id="strategy"
                name="strategy"
                defaultValue="auto"
                className="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="auto">Auto</option>
                <option value="http">HTTP</option>
                <option value="browser">Browser</option>
              </select>
            </div>
            <label className="flex min-h-8 items-center gap-2 self-end text-sm">
              <input
                name="include_html"
                type="checkbox"
                checked={includeHtml}
                onChange={(event) => setIncludeHtml(event.currentTarget.checked)}
                className="size-4 accent-primary"
              />
              Include HTML
            </label>
          </div>

          <Button type="submit" disabled={state.status === "running"}>
            {state.status === "running" ? "Running..." : "Run crawler"}
          </Button>
        </form>

        {state.status === "error" ? (
          <p className="rounded-lg border border-destructive/40 px-3 py-2 text-sm text-destructive">
            {state.message}
          </p>
        ) : null}

        {state.status === "done" ? (
          <pre className="max-h-[32rem] overflow-auto rounded-lg border bg-muted/50 p-4 font-mono text-xs leading-relaxed">
            {JSON.stringify(state.body, null, 2)}
          </pre>
        ) : null}
      </CardContent>
    </Card>
  );
}

function WebsiteLogoExtractorRunner({ slug }: { slug: string }) {
  const [state, setState] = useState<RunState>({ status: "idle" });
  const [includeManifestIcons, setIncludeManifestIcons] = useState(true);

  async function runTool(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState({ status: "running" });
    const form = new FormData(event.currentTarget);
    const urls = String(form.get("urls") ?? "")
      .split(/\r?\n/)
      .map((url) => url.trim())
      .filter(Boolean);

    const payload = {
      urls,
      maxConcurrency: Number(form.get("maxConcurrency") || 10),
      timeoutSecs: Number(form.get("timeoutSecs") || 30),
      strategy: String(form.get("strategy") || "http"),
      includeManifestIcons,
    };

    try {
      const response = await fetch(`/api/tools/${slug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setState({
          status: "error",
          message: body?.error ?? `Run failed (${response.status})`,
        });
        return;
      }
      setState({ status: "done", body });
    } catch {
      setState({ status: "error", message: "Run failed. Check your connection." });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Run</CardTitle>
        <CardDescription>Extract logos from one or more websites.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={runTool} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="urls">URLs</Label>
            <textarea
              id="urls"
              name="urls"
              required
              rows={4}
              className="min-h-28 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              placeholder="https://betterfetch.co&#10;https://github.com"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="maxConcurrency">Max concurrency</Label>
              <Input
                id="maxConcurrency"
                name="maxConcurrency"
                type="number"
                min={1}
                max={50}
                defaultValue={10}
                inputMode="numeric"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="timeoutSecs">Timeout seconds</Label>
              <Input
                id="timeoutSecs"
                name="timeoutSecs"
                type="number"
                min={5}
                max={120}
                defaultValue={30}
                inputMode="numeric"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="strategy">Strategy</Label>
              <select
                id="strategy"
                name="strategy"
                defaultValue="http"
                className="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="http">HTTP</option>
                <option value="auto">Auto</option>
                <option value="browser">Browser</option>
              </select>
            </div>
            <label className="flex min-h-8 items-center gap-2 self-end text-sm">
              <input
                name="includeManifestIcons"
                type="checkbox"
                checked={includeManifestIcons}
                onChange={(event) =>
                  setIncludeManifestIcons(event.currentTarget.checked)
                }
                className="size-4 accent-primary"
              />
              Manifest icons
            </label>
          </div>

          <Button type="submit" disabled={state.status === "running"}>
            {state.status === "running" ? "Running..." : "Extract logos"}
          </Button>
        </form>

        {state.status === "error" ? (
          <p className="rounded-lg border border-destructive/40 px-3 py-2 text-sm text-destructive">
            {state.message}
          </p>
        ) : null}

        {state.status === "done" ? (
          <pre className="max-h-[32rem] overflow-auto rounded-lg border bg-muted/50 p-4 font-mono text-xs leading-relaxed">
            {JSON.stringify(state.body, null, 2)}
          </pre>
        ) : null}
      </CardContent>
    </Card>
  );
}

function SitemapUrlExtractorRunner({ slug }: { slug: string }) {
  const [state, setState] = useState<RunState>({ status: "idle" });

  async function runTool(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState({ status: "running" });
    const form = new FormData(event.currentTarget);
    const sitemapUrls = String(form.get("sitemapUrls") ?? "")
      .split(/\r?\n/)
      .map((url) => url.trim())
      .filter(Boolean);

    const payload = {
      sitemapUrls,
      maxUrls: Number(form.get("maxUrls") || 10000),
    };

    try {
      const response = await fetch(`/api/tools/${slug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setState({
          status: "error",
          message: body?.error ?? `Run failed (${response.status})`,
        });
        return;
      }
      setState({ status: "done", body });
    } catch {
      setState({ status: "error", message: "Run failed. Check your connection." });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Run</CardTitle>
        <CardDescription>Extract URL inventory rows from XML sitemaps.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={runTool} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="sitemapUrls">Sitemap URLs</Label>
            <textarea
              id="sitemapUrls"
              name="sitemapUrls"
              required
              rows={4}
              className="min-h-28 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              placeholder="https://example.com/sitemap.xml"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="maxUrls">Max URLs</Label>
              <Input
                id="maxUrls"
                name="maxUrls"
                type="number"
                min={1}
                max={100000}
                defaultValue={10000}
                inputMode="numeric"
              />
            </div>
          </div>

          <Button type="submit" disabled={state.status === "running"}>
            {state.status === "running" ? "Running..." : "Extract URLs"}
          </Button>
        </form>

        {state.status === "error" ? (
          <p className="rounded-lg border border-destructive/40 px-3 py-2 text-sm text-destructive">
            {state.message}
          </p>
        ) : null}

        {state.status === "done" ? (
          <pre className="max-h-[32rem] overflow-auto rounded-lg border bg-muted/50 p-4 font-mono text-xs leading-relaxed">
            {JSON.stringify(state.body, null, 2)}
          </pre>
        ) : null}
      </CardContent>
    </Card>
  );
}

function RssFeedReaderRunner({ slug }: { slug: string }) {
  const [state, setState] = useState<RunState>({ status: "idle" });

  async function runTool(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState({ status: "running" });
    const form = new FormData(event.currentTarget);
    const feedUrls = String(form.get("feedUrls") ?? "")
      .split(/\r?\n/)
      .map((url) => url.trim())
      .filter(Boolean);
    const publishedAfter = String(form.get("publishedAfter") ?? "").trim();

    const payload = {
      feedUrls,
      ...(publishedAfter ? { publishedAfter } : {}),
      maxItemsPerFeed: Number(form.get("maxItemsPerFeed") || 25),
      maxTotalItems: Number(form.get("maxTotalItems") || 25),
    };

    try {
      const response = await fetch(`/api/tools/${slug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setState({
          status: "error",
          message: body?.error ?? `Run failed (${response.status})`,
        });
        return;
      }
      setState({ status: "done", body });
    } catch {
      setState({ status: "error", message: "Run failed. Check your connection." });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Run</CardTitle>
        <CardDescription>Read public RSS, Atom, RDF, and JSON feeds.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={runTool} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="feedUrls">Feed URLs</Label>
            <textarea
              id="feedUrls"
              name="feedUrls"
              required
              rows={4}
              className="min-h-28 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              placeholder="https://hnrss.org/frontpage&#10;https://www.jsonfeed.org/feed.json"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="publishedAfter">Published after</Label>
              <Input id="publishedAfter" name="publishedAfter" type="date" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="maxItemsPerFeed">Max per feed</Label>
              <Input
                id="maxItemsPerFeed"
                name="maxItemsPerFeed"
                type="number"
                min={1}
                max={500}
                defaultValue={25}
                inputMode="numeric"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="maxTotalItems">Max total</Label>
              <Input
                id="maxTotalItems"
                name="maxTotalItems"
                type="number"
                min={1}
                max={5000}
                defaultValue={25}
                inputMode="numeric"
              />
            </div>
          </div>

          <Button type="submit" disabled={state.status === "running"}>
            {state.status === "running" ? "Running..." : "Read feeds"}
          </Button>
        </form>

        {state.status === "error" ? (
          <p className="rounded-lg border border-destructive/40 px-3 py-2 text-sm text-destructive">
            {state.message}
          </p>
        ) : null}

        {state.status === "done" ? (
          <pre className="max-h-[32rem] overflow-auto rounded-lg border bg-muted/50 p-4 font-mono text-xs leading-relaxed">
            {JSON.stringify(state.body, null, 2)}
          </pre>
        ) : null}
      </CardContent>
    </Card>
  );
}
