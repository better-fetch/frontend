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
  if (slug === "google-search-results") {
    return <GoogleSearchResultsRunner slug={slug} />;
  }
  if (slug === "google-maps-places") {
    return <GoogleMapsPlacesRunner slug={slug} />;
  }
  if (slug === "amazon-product-details") {
    return <AmazonProductDetailsRunner slug={slug} />;
  }
  if (slug === "youtube-video-details") {
    return <YoutubeVideoDetailsRunner slug={slug} />;
  }
  if (slug === "reddit-posts-comments") {
    return <RedditPostsCommentsRunner slug={slug} />;
  }
  if (slug === "instagram-profile-posts") {
    return <InstagramProfilePostsRunner slug={slug} />;
  }
  if (slug === "tiktok-profile-videos") {
    return <TiktokProfileVideosRunner slug={slug} />;
  }
  if (slug === "meta-ads-library") {
    return <MetaAdsLibraryRunner slug={slug} />;
  }
  if (slug === "x-profile-posts") {
    return <XProfilePostsRunner slug={slug} />;
  }
  if (slug === "facebook-pages") {
    return <FacebookPagesRunner slug={slug} />;
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

function GoogleSearchResultsRunner({ slug }: { slug: string }) {
  const [state, setState] = useState<RunState>({ status: "idle" });
  const [mobileResults, setMobileResults] = useState(false);

  async function runTool(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState({ status: "running" });
    const form = new FormData(event.currentTarget);
    const queries = String(form.get("queries") ?? "")
      .split(/\r?\n/)
      .map((query) => query.trim())
      .filter(Boolean);

    const payload = {
      queries,
      countryCode: String(form.get("countryCode") || "us"),
      languageCode: String(form.get("languageCode") || "en"),
      googleDomain: String(form.get("googleDomain") || "google.com"),
      maxPagesPerQuery: Number(form.get("maxPagesPerQuery") || 1),
      resultsPerPage: Number(form.get("resultsPerPage") || 10),
      strategy: String(form.get("strategy") || "browser"),
      mobileResults,
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
        <CardDescription>
          Extract organic, sponsored, People Also Ask, and related query sections.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={runTool} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="queries">Search terms or Google search URLs</Label>
            <textarea
              id="queries"
              name="queries"
              required
              rows={4}
              className="min-h-28 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              placeholder="best crm software&#10;https://www.google.com/search?q=headless+browser+api"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="countryCode">Country</Label>
              <Input
                id="countryCode"
                name="countryCode"
                defaultValue="us"
                maxLength={2}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="languageCode">Language</Label>
              <Input id="languageCode" name="languageCode" defaultValue="en" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="googleDomain">Domain</Label>
              <Input id="googleDomain" name="googleDomain" defaultValue="google.com" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="maxPagesPerQuery">Pages per query</Label>
              <Input
                id="maxPagesPerQuery"
                name="maxPagesPerQuery"
                type="number"
                min={1}
                max={10}
                defaultValue={1}
                inputMode="numeric"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="resultsPerPage">Results per page</Label>
              <Input
                id="resultsPerPage"
                name="resultsPerPage"
                type="number"
                min={1}
                max={100}
                defaultValue={10}
                inputMode="numeric"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="strategy">Strategy</Label>
              <select
                id="strategy"
                name="strategy"
                defaultValue="browser"
                className="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="browser">Browser</option>
                <option value="auto">Auto</option>
                <option value="http">HTTP</option>
              </select>
            </div>
            <label className="flex min-h-8 items-center gap-2 self-end text-sm">
              <input
                name="mobileResults"
                type="checkbox"
                checked={mobileResults}
                onChange={(event) => setMobileResults(event.currentTarget.checked)}
                className="size-4 accent-primary"
              />
              Mobile results
            </label>
          </div>

          <Button type="submit" disabled={state.status === "running"}>
            {state.status === "running" ? "Running..." : "Extract search results"}
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

function GoogleMapsPlacesRunner({ slug }: { slug: string }) {
  const [state, setState] = useState<RunState>({ status: "idle" });

  async function runTool(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState({ status: "running" });
    const form = new FormData(event.currentTarget);
    const searches = String(form.get("searches") ?? "")
      .split(/\r?\n/)
      .map((search) => search.trim())
      .filter(Boolean);

    const payload = {
      searches,
      countryCode: String(form.get("countryCode") || "us"),
      languageCode: String(form.get("languageCode") || "en"),
      maxPlacesPerSearch: Number(form.get("maxPlacesPerSearch") || 40),
      strategy: String(form.get("strategy") || "browser"),
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
        <CardDescription>
          Extract structured local business rows from Google Maps pages.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={runTool} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="searches">Search terms or Google Maps URLs</Label>
            <textarea
              id="searches"
              name="searches"
              required
              rows={4}
              className="min-h-28 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              placeholder="cafes brisbane&#10;https://www.google.com/maps/search/plumbers+seattle"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="countryCode">Country</Label>
              <Input
                id="countryCode"
                name="countryCode"
                defaultValue="us"
                maxLength={2}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="languageCode">Language</Label>
              <Input id="languageCode" name="languageCode" defaultValue="en" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="maxPlacesPerSearch">Max places</Label>
              <Input
                id="maxPlacesPerSearch"
                name="maxPlacesPerSearch"
                type="number"
                min={1}
                max={500}
                defaultValue={40}
                inputMode="numeric"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="strategy">Strategy</Label>
              <select
                id="strategy"
                name="strategy"
                defaultValue="browser"
                className="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="browser">Browser</option>
                <option value="auto">Auto</option>
                <option value="http">HTTP</option>
              </select>
            </div>
          </div>

          <Button type="submit" disabled={state.status === "running"}>
            {state.status === "running" ? "Running..." : "Extract places"}
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

function AmazonProductDetailsRunner({ slug }: { slug: string }) {
  const [state, setState] = useState<RunState>({ status: "idle" });

  async function runTool(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState({ status: "running" });
    const form = new FormData(event.currentTarget);
    const products = String(form.get("products") ?? "")
      .split(/\r?\n/)
      .map((product) => product.trim())
      .filter(Boolean);

    const payload = {
      products,
      amazonDomain: String(form.get("amazonDomain") || "amazon.com"),
      countryCode: String(form.get("countryCode") || "us"),
      languageCode: String(form.get("languageCode") || "en"),
      strategy: String(form.get("strategy") || "browser"),
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
        <CardDescription>
          Extract structured product detail rows from Amazon product pages.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={runTool} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="products">Amazon product URLs or ASINs</Label>
            <textarea
              id="products"
              name="products"
              required
              rows={4}
              className="min-h-28 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              placeholder="https://www.amazon.com/dp/B0ACME1234&#10;B09TEST123"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="amazonDomain">Amazon domain</Label>
              <Input id="amazonDomain" name="amazonDomain" defaultValue="amazon.com" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="countryCode">Country</Label>
              <Input
                id="countryCode"
                name="countryCode"
                defaultValue="us"
                maxLength={2}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="languageCode">Language</Label>
              <Input id="languageCode" name="languageCode" defaultValue="en" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="strategy">Strategy</Label>
              <select
                id="strategy"
                name="strategy"
                defaultValue="browser"
                className="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="browser">Browser</option>
                <option value="auto">Auto</option>
                <option value="http">HTTP</option>
              </select>
            </div>
          </div>

          <Button type="submit" disabled={state.status === "running"}>
            {state.status === "running" ? "Running..." : "Extract products"}
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

function YoutubeVideoDetailsRunner({ slug }: { slug: string }) {
  const [state, setState] = useState<RunState>({ status: "idle" });

  async function runTool(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState({ status: "running" });
    const form = new FormData(event.currentTarget);
    const videos = String(form.get("videos") ?? "")
      .split(/\r?\n/)
      .map((video) => video.trim())
      .filter(Boolean);

    const payload = {
      videos,
      countryCode: String(form.get("countryCode") || "us"),
      languageCode: String(form.get("languageCode") || "en"),
      strategy: String(form.get("strategy") || "browser"),
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
        <CardDescription>
          Extract structured detail rows from YouTube watch pages.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={runTool} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="videos">YouTube URLs or video IDs</Label>
            <textarea
              id="videos"
              name="videos"
              required
              rows={4}
              className="min-h-28 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              placeholder="https://www.youtube.com/watch?v=dQw4w9WgXcQ&#10;dQw4w9WgXcQ"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="countryCode">Country</Label>
              <Input
                id="countryCode"
                name="countryCode"
                defaultValue="us"
                maxLength={2}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="languageCode">Language</Label>
              <Input id="languageCode" name="languageCode" defaultValue="en" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="strategy">Strategy</Label>
              <select
                id="strategy"
                name="strategy"
                defaultValue="browser"
                className="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="browser">Browser</option>
                <option value="auto">Auto</option>
                <option value="http">HTTP</option>
              </select>
            </div>
          </div>

          <Button type="submit" disabled={state.status === "running"}>
            {state.status === "running" ? "Running..." : "Extract videos"}
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

function RedditPostsCommentsRunner({ slug }: { slug: string }) {
  const [state, setState] = useState<RunState>({ status: "idle" });
  const [includeComments, setIncludeComments] = useState(true);

  async function runTool(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState({ status: "running" });
    const form = new FormData(event.currentTarget);
    const sources = String(form.get("sources") ?? "")
      .split(/\r?\n/)
      .map((source) => source.trim())
      .filter(Boolean);

    const payload = {
      sources,
      sort: String(form.get("sort") || "relevance"),
      timeRange: String(form.get("timeRange") || "week"),
      maxPostsPerSource: Number(form.get("maxPostsPerSource") || 25),
      includeComments,
      maxCommentsPerPost: Number(form.get("maxCommentsPerPost") || 50),
      countryCode: String(form.get("countryCode") || "us"),
      languageCode: String(form.get("languageCode") || "en"),
      strategy: String(form.get("strategy") || "browser"),
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
        <CardDescription>
          Extract structured posts and visible comments from Reddit pages.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={runTool} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="sources">Reddit URLs, communities, users, or searches</Label>
            <textarea
              id="sources"
              name="sources"
              required
              rows={4}
              className="min-h-28 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              placeholder="r/webscraping&#10;u/spez&#10;https://www.reddit.com/r/marketing/comments/...&#10;customer research tools"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="sort">Sort</Label>
              <select
                id="sort"
                name="sort"
                defaultValue="relevance"
                className="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="relevance">Relevance</option>
                <option value="hot">Hot</option>
                <option value="new">New</option>
                <option value="top">Top</option>
                <option value="comments">Comments</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="timeRange">Time range</Label>
              <select
                id="timeRange"
                name="timeRange"
                defaultValue="week"
                className="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="hour">Hour</option>
                <option value="day">Day</option>
                <option value="week">Week</option>
                <option value="month">Month</option>
                <option value="year">Year</option>
                <option value="all">All</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="maxPostsPerSource">Max posts</Label>
              <Input
                id="maxPostsPerSource"
                name="maxPostsPerSource"
                type="number"
                min={1}
                max={500}
                defaultValue={25}
                inputMode="numeric"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="maxCommentsPerPost">Max comments</Label>
              <Input
                id="maxCommentsPerPost"
                name="maxCommentsPerPost"
                type="number"
                min={0}
                max={500}
                defaultValue={50}
                inputMode="numeric"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="countryCode">Country</Label>
              <Input
                id="countryCode"
                name="countryCode"
                defaultValue="us"
                maxLength={2}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="languageCode">Language</Label>
              <Input id="languageCode" name="languageCode" defaultValue="en" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="strategy">Strategy</Label>
              <select
                id="strategy"
                name="strategy"
                defaultValue="browser"
                className="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="browser">Browser</option>
                <option value="auto">Auto</option>
                <option value="http">HTTP</option>
              </select>
            </div>
            <label className="flex min-h-8 items-center gap-2 self-end text-sm">
              <input
                name="includeComments"
                type="checkbox"
                checked={includeComments}
                onChange={(event) => setIncludeComments(event.currentTarget.checked)}
                className="size-4 accent-primary"
              />
              Include comments
            </label>
          </div>

          <Button type="submit" disabled={state.status === "running"}>
            {state.status === "running" ? "Running..." : "Extract posts"}
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

function InstagramProfilePostsRunner({ slug }: { slug: string }) {
  const [state, setState] = useState<RunState>({ status: "idle" });

  async function runTool(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState({ status: "running" });
    const form = new FormData(event.currentTarget);
    const targets = String(form.get("targets") ?? "")
      .split(/\r?\n/)
      .map((target) => target.trim())
      .filter(Boolean);

    const payload = {
      targets,
      maxPostsPerTarget: Number(form.get("maxPostsPerTarget") || 24),
      countryCode: String(form.get("countryCode") || "us"),
      languageCode: String(form.get("languageCode") || "en"),
      strategy: String(form.get("strategy") || "browser"),
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
        <CardDescription>
          Extract structured profile, post, reel, and hashtag rows from public Instagram pages.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={runTool} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="targets">Instagram usernames, URLs, or hashtags</Label>
            <textarea
              id="targets"
              name="targets"
              required
              rows={4}
              className="min-h-28 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              placeholder="instagram&#10;https://www.instagram.com/reel/...&#10;#marketresearch"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="maxPostsPerTarget">Max posts</Label>
              <Input
                id="maxPostsPerTarget"
                name="maxPostsPerTarget"
                type="number"
                min={1}
                max={500}
                defaultValue={24}
                inputMode="numeric"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="countryCode">Country</Label>
              <Input
                id="countryCode"
                name="countryCode"
                defaultValue="us"
                maxLength={2}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="languageCode">Language</Label>
              <Input id="languageCode" name="languageCode" defaultValue="en" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="strategy">Strategy</Label>
              <select
                id="strategy"
                name="strategy"
                defaultValue="browser"
                className="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="browser">Browser</option>
                <option value="auto">Auto</option>
                <option value="http">HTTP</option>
              </select>
            </div>
          </div>

          <Button type="submit" disabled={state.status === "running"}>
            {state.status === "running" ? "Running..." : "Extract Instagram data"}
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

function TiktokProfileVideosRunner({ slug }: { slug: string }) {
  const [state, setState] = useState<RunState>({ status: "idle" });

  async function runTool(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState({ status: "running" });
    const form = new FormData(event.currentTarget);
    const targets = String(form.get("targets") ?? "")
      .split(/\r?\n/)
      .map((target) => target.trim())
      .filter(Boolean);

    const payload = {
      targets,
      maxVideosPerTarget: Number(form.get("maxVideosPerTarget") || 24),
      countryCode: String(form.get("countryCode") || "us"),
      languageCode: String(form.get("languageCode") || "en"),
      strategy: String(form.get("strategy") || "browser"),
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
        <CardDescription>
          Extract structured profile and video rows from public TikTok pages.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={runTool} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="targets">TikTok usernames, URLs, hashtags, or searches</Label>
            <textarea
              id="targets"
              name="targets"
              required
              rows={4}
              className="min-h-28 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              placeholder="@tiktok&#10;https://www.tiktok.com/@creator/video/...&#10;#marketresearch&#10;customer research tools"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="maxVideosPerTarget">Max videos</Label>
              <Input
                id="maxVideosPerTarget"
                name="maxVideosPerTarget"
                type="number"
                min={1}
                max={500}
                defaultValue={24}
                inputMode="numeric"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="countryCode">Country</Label>
              <Input
                id="countryCode"
                name="countryCode"
                defaultValue="us"
                maxLength={2}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="languageCode">Language</Label>
              <Input id="languageCode" name="languageCode" defaultValue="en" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="strategy">Strategy</Label>
              <select
                id="strategy"
                name="strategy"
                defaultValue="browser"
                className="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="browser">Browser</option>
                <option value="auto">Auto</option>
                <option value="http">HTTP</option>
              </select>
            </div>
          </div>

          <Button type="submit" disabled={state.status === "running"}>
            {state.status === "running" ? "Running..." : "Extract TikTok data"}
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

function MetaAdsLibraryRunner({ slug }: { slug: string }) {
  const [state, setState] = useState<RunState>({ status: "idle" });

  async function runTool(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState({ status: "running" });
    const form = new FormData(event.currentTarget);
    const targets = String(form.get("targets") ?? "")
      .split(/\r?\n/)
      .map((target) => target.trim())
      .filter(Boolean);

    const payload = {
      targets,
      maxAdsPerTarget: Number(form.get("maxAdsPerTarget") || 50),
      countryCode: String(form.get("countryCode") || "us"),
      languageCode: String(form.get("languageCode") || "en"),
      activeStatus: String(form.get("activeStatus") || "active"),
      mediaType: String(form.get("mediaType") || "all"),
      strategy: String(form.get("strategy") || "browser"),
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
        <CardDescription>
          Extract structured ad rows from public Meta Ads Library pages.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={runTool} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="targets">Ads Library URLs, page IDs, or keyword searches</Label>
            <textarea
              id="targets"
              name="targets"
              required
              rows={4}
              className="min-h-28 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              placeholder="browser data api&#10;page:15087023444&#10;https://www.facebook.com/ads/library/?..."
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="activeStatus">Status</Label>
              <select
                id="activeStatus"
                name="activeStatus"
                defaultValue="active"
                className="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="all">All</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="mediaType">Media</Label>
              <select
                id="mediaType"
                name="mediaType"
                defaultValue="all"
                className="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="all">All</option>
                <option value="image">Image</option>
                <option value="video">Video</option>
                <option value="meme">Meme</option>
                <option value="none">No media</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="maxAdsPerTarget">Max ads</Label>
              <Input
                id="maxAdsPerTarget"
                name="maxAdsPerTarget"
                type="number"
                min={1}
                max={500}
                defaultValue={50}
                inputMode="numeric"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="countryCode">Country</Label>
              <Input
                id="countryCode"
                name="countryCode"
                defaultValue="us"
                maxLength={2}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="languageCode">Language</Label>
              <Input id="languageCode" name="languageCode" defaultValue="en" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="strategy">Strategy</Label>
              <select
                id="strategy"
                name="strategy"
                defaultValue="browser"
                className="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="browser">Browser</option>
                <option value="auto">Auto</option>
                <option value="http">HTTP</option>
              </select>
            </div>
          </div>

          <Button type="submit" disabled={state.status === "running"}>
            {state.status === "running" ? "Running..." : "Extract ads"}
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

function XProfilePostsRunner({ slug }: { slug: string }) {
  const [state, setState] = useState<RunState>({ status: "idle" });
  const [includeReplies, setIncludeReplies] = useState(false);

  async function runTool(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState({ status: "running" });
    const form = new FormData(event.currentTarget);
    const targets = String(form.get("targets") ?? "")
      .split(/\r?\n/)
      .map((target) => target.trim())
      .filter(Boolean);

    const payload = {
      targets,
      sort: String(form.get("sort") || "latest"),
      maxPostsPerTarget: Number(form.get("maxPostsPerTarget") || 25),
      includeReplies,
      countryCode: String(form.get("countryCode") || "us"),
      languageCode: String(form.get("languageCode") || "en"),
      strategy: String(form.get("strategy") || "browser"),
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
        <CardDescription>
          Extract structured profile and post rows from public X pages.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={runTool} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="targets">X handles, URLs, hashtags, or searches</Label>
            <textarea
              id="targets"
              name="targets"
              required
              rows={4}
              className="min-h-28 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              placeholder="@betterfetch&#10;https://x.com/user/status/...&#10;#marketresearch&#10;customer research tools"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="sort">Sort</Label>
              <select
                id="sort"
                name="sort"
                defaultValue="latest"
                className="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="latest">Latest</option>
                <option value="top">Top</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="maxPostsPerTarget">Max posts</Label>
              <Input
                id="maxPostsPerTarget"
                name="maxPostsPerTarget"
                type="number"
                min={1}
                max={500}
                defaultValue={25}
                inputMode="numeric"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="countryCode">Country</Label>
              <Input
                id="countryCode"
                name="countryCode"
                defaultValue="us"
                maxLength={2}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="languageCode">Language</Label>
              <Input id="languageCode" name="languageCode" defaultValue="en" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="strategy">Strategy</Label>
              <select
                id="strategy"
                name="strategy"
                defaultValue="browser"
                className="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="browser">Browser</option>
                <option value="auto">Auto</option>
                <option value="http">HTTP</option>
              </select>
            </div>
            <label className="flex min-h-8 items-center gap-2 self-end text-sm">
              <input
                name="includeReplies"
                type="checkbox"
                checked={includeReplies}
                onChange={(event) => setIncludeReplies(event.currentTarget.checked)}
                className="size-4 accent-primary"
              />
              Include replies
            </label>
          </div>

          <Button type="submit" disabled={state.status === "running"}>
            {state.status === "running" ? "Running..." : "Extract X data"}
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

function FacebookPagesRunner({ slug }: { slug: string }) {
  const [state, setState] = useState<RunState>({ status: "idle" });

  async function runTool(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState({ status: "running" });
    const form = new FormData(event.currentTarget);
    const pages = String(form.get("pages") ?? "")
      .split(/\r?\n/)
      .map((page) => page.trim())
      .filter(Boolean);

    const payload = {
      pages,
      section: String(form.get("section") || "about"),
      maxPages: Number(form.get("maxPages") || 100),
      countryCode: String(form.get("countryCode") || "us"),
      languageCode: String(form.get("languageCode") || "en"),
      strategy: String(form.get("strategy") || "browser"),
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
        <CardDescription>
          Extract structured rows from public Facebook Pages and Profiles.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={runTool} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="pages">Facebook URLs, page IDs, or handles</Label>
            <textarea
              id="pages"
              name="pages"
              required
              rows={4}
              className="min-h-28 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              placeholder="nasaearth&#10;https://www.facebook.com/humansofnewyork&#10;123456789"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="section">Section</Label>
              <select
                id="section"
                name="section"
                defaultValue="about"
                className="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="about">About</option>
                <option value="home">Home</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="maxPages">Max pages</Label>
              <Input
                id="maxPages"
                name="maxPages"
                type="number"
                min={1}
                max={100}
                defaultValue={100}
                inputMode="numeric"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="countryCode">Country</Label>
              <Input
                id="countryCode"
                name="countryCode"
                defaultValue="us"
                maxLength={2}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="languageCode">Language</Label>
              <Input id="languageCode" name="languageCode" defaultValue="en" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="strategy">Strategy</Label>
              <select
                id="strategy"
                name="strategy"
                defaultValue="browser"
                className="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="browser">Browser</option>
                <option value="auto">Auto</option>
                <option value="http">HTTP</option>
              </select>
            </div>
          </div>

          <Button type="submit" disabled={state.status === "running"}>
            {state.status === "running" ? "Running..." : "Extract pages"}
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
