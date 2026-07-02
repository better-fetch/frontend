import * as cheerio from "cheerio";
import { z } from "zod";

const HTTP_URL = z
  .string()
  .url()
  .refine((value) => {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  }, "Only HTTP and HTTPS URLs can be crawled");

const DEFAULT_REMOVE_SELECTORS = [
  "script",
  "style",
  "noscript",
  "svg",
  "canvas",
  "iframe",
  "nav",
  "header",
  "footer",
  "aside",
  "form",
  "[role='navigation']",
  "[aria-modal='true']",
  "[class*='cookie' i]",
  "[id*='cookie' i]",
  "[class*='modal' i]",
  "[id*='modal' i]",
];

export const WEBSITE_CONTENT_CRAWLER_INPUT_SCHEMA = z.object({
  start_urls: z.array(HTTP_URL).min(1).max(10),
  max_pages: z.number().int().min(1).max(25).default(5),
  max_depth: z.number().int().min(0).max(4).default(1),
  scope: z.enum(["path", "origin", "page"]).default("path"),
  output_format: z.enum(["markdown", "text", "html"]).default("markdown"),
  include_html: z.boolean().default(false),
  extract_selector: z.string().min(1).max(200).optional(),
  remove_selectors: z.array(z.string().min(1).max(200)).max(20).default([]),
  exclude_globs: z.array(z.string().min(1).max(500)).max(25).default([]),
  wait_ms: z.number().int().min(0).max(30_000).optional(),
  timeout_ms: z.number().int().min(1).max(240_000).optional(),
  strategy: z.enum(["auto", "http", "browser"]).default("auto"),
  country: z.string().length(2).optional(),
  session: z.string().max(64).optional(),
  cache_ttl_ms: z.number().int().min(0).max(60_000).default(30_000),
});

export const WEBSITE_CONTENT_CRAWLER_MCP_INPUT_SCHEMA = {
  start_urls: z
    .array(HTTP_URL)
    .min(1)
    .max(10)
    .describe("One or more HTTP/HTTPS URLs to start crawling from"),
  max_pages: z
    .number()
    .int()
    .min(1)
    .max(25)
    .optional()
    .describe("Maximum pages to fetch before stopping (default 5, max 25)"),
  max_depth: z
    .number()
    .int()
    .min(0)
    .max(4)
    .optional()
    .describe("Maximum link depth from each start URL (default 1)"),
  scope: z
    .enum(["path", "origin", "page"])
    .optional()
    .describe("Crawl boundary: path stays below each start URL path, origin stays on the host, page fetches only starts"),
  output_format: z
    .enum(["markdown", "text", "html"])
    .optional()
    .describe("Primary output to optimize for in each result record (default markdown)"),
  include_html: z
    .boolean()
    .optional()
    .describe("Include cleaned HTML in each result record"),
  extract_selector: z
    .string()
    .max(200)
    .optional()
    .describe("Optional CSS selector for the page region to keep before extracting text"),
  remove_selectors: z
    .array(z.string().max(200))
    .max(20)
    .optional()
    .describe("Additional CSS selectors to remove before extraction"),
  exclude_globs: z
    .array(z.string().max(500))
    .max(25)
    .optional()
    .describe("URL glob patterns to skip when links are discovered"),
  wait_ms: z
    .number()
    .int()
    .min(0)
    .max(30_000)
    .optional()
    .describe("Extra milliseconds to wait after loading each page"),
  timeout_ms: z
    .number()
    .int()
    .min(1)
    .max(240_000)
    .optional()
    .describe("Per-page Better Fetch timeout in milliseconds"),
  strategy: z
    .enum(["auto", "http", "browser"])
    .optional()
    .describe("Better Fetch strategy for each page (default auto)"),
  country: z
    .string()
    .length(2)
    .optional()
    .describe("Two-letter country code for browser locale/timezone defaults"),
  session: z
    .string()
    .max(64)
    .optional()
    .describe("Account-scoped Better Fetch browser session to reuse across pages"),
  cache_ttl_ms: z
    .number()
    .int()
    .min(0)
    .max(60_000)
    .optional()
    .describe("Short-lived Better Fetch response cache TTL for each page"),
};

export type WebsiteContentCrawlerInput = z.input<
  typeof WEBSITE_CONTENT_CRAWLER_INPUT_SCHEMA
>;
export type WebsiteContentCrawlerOptions = z.output<
  typeof WEBSITE_CONTENT_CRAWLER_INPUT_SCHEMA
>;

export type WebsiteContentCrawlerFetchRequest = {
  url: string;
  wait_ms?: number;
  timeout_ms?: number;
  strategy: "auto" | "http" | "browser";
  country?: string;
  session?: string;
  cache_ttl_ms: number;
};

export type WebsiteContentCrawlerFetchResult = {
  ok?: boolean;
  error?: string;
  message?: string;
  status?: number;
  final_url?: string;
  title?: string;
  html?: string | null;
  body_text?: string | null;
  blocked?: boolean;
  block_reason?: string;
  content_type?: string;
  timing_ms?: number;
};

export type WebsiteContentCrawlerFetch = (
  request: WebsiteContentCrawlerFetchRequest,
) => Promise<WebsiteContentCrawlerFetchResult>;

export type WebsiteContentCrawlerRecord = {
  url: string;
  crawl: {
    loadedUrl: string;
    loadedTime: string;
    referrerUrl: string | null;
    depth: number;
    statusCode: number | null;
  };
  metadata: {
    canonicalUrl: string | null;
    title: string | null;
    description: string | null;
    languageCode: string | null;
  };
  screenshotUrl: null;
  text: string | null;
  markdown: string | null;
  html: string | null;
};

export type WebsiteContentCrawlerError = {
  url: string;
  loadedTime: string;
  referrerUrl: string | null;
  depth: number;
  error: string;
  message: string;
  statusCode: number | null;
};

type QueueItem = {
  url: string;
  depth: number;
  referrerUrl: string | null;
};

type ParsedPage = {
  canonicalUrl: string | null;
  title: string | null;
  description: string | null;
  languageCode: string | null;
  text: string;
  markdown: string;
  html: string;
  links: string[];
};

type Selection = ReturnType<cheerio.CheerioAPI>;

export async function crawlWebsiteContent(
  input: WebsiteContentCrawlerInput,
  fetchPage: WebsiteContentCrawlerFetch,
) {
  const options = WEBSITE_CONTENT_CRAWLER_INPUT_SCHEMA.parse(input);
  const startUrls = options.start_urls.map(normalizeUrl);
  const excludePatterns = options.exclude_globs.map(globToRegExp);
  const queue: QueueItem[] = startUrls.map((url) => ({
    url,
    depth: 0,
    referrerUrl: null,
  }));
  const seen = new Set(queue.map((item) => item.url));
  const pages: WebsiteContentCrawlerRecord[] = [];
  const errors: WebsiteContentCrawlerError[] = [];
  let attempted = 0;

  while (queue.length > 0 && attempted < options.max_pages) {
    const item = queue.shift()!;
    attempted += 1;
    const loadedTime = new Date().toISOString();
    let result: WebsiteContentCrawlerFetchResult;

    try {
      result = await fetchPage({
        url: item.url,
        wait_ms: options.wait_ms,
        timeout_ms: options.timeout_ms,
        strategy: options.strategy,
        country: options.country,
        session: options.session,
        cache_ttl_ms: options.cache_ttl_ms,
      });
    } catch (error) {
      errors.push(toError(item, loadedTime, "fetch_failed", errorMessage(error), null));
      continue;
    }

    if (result.ok === false) {
      errors.push(
        toError(
          item,
          loadedTime,
          result.error ?? "fetch_failed",
          result.message ?? "Better Fetch request failed",
          result.status ?? null,
        ),
      );
      continue;
    }

    const loadedUrl = normalizeUrl(result.final_url ?? item.url);
    const html = result.html ?? "";
    const parsed = parsePage(html, loadedUrl, result.title, options);

    pages.push({
      url: item.url,
      crawl: {
        loadedUrl,
        loadedTime,
        referrerUrl: item.referrerUrl,
        depth: item.depth,
        statusCode: result.status ?? null,
      },
      metadata: {
        canonicalUrl: parsed.canonicalUrl,
        title: parsed.title,
        description: parsed.description,
        languageCode: parsed.languageCode,
      },
      screenshotUrl: null,
      text: options.output_format === "html" ? null : parsed.text,
      markdown: options.output_format === "text" ? null : parsed.markdown,
      html: options.include_html || options.output_format === "html" ? parsed.html : null,
    });

    if (item.depth >= options.max_depth || options.scope === "page") continue;

    for (const link of parsed.links) {
      if (seen.has(link)) continue;
      if (!withinAnyStartScope(link, startUrls, options.scope)) continue;
      if (excludePatterns.some((pattern) => pattern.test(link))) continue;
      seen.add(link);
      queue.push({ url: link, depth: item.depth + 1, referrerUrl: loadedUrl });
    }
  }

  return {
    ok: errors.length === 0,
    tool: "website_content_crawler",
    fetched: attempted,
    item_count: pages.length,
    error_count: errors.length,
    pages,
    errors,
  };
}

function parsePage(
  html: string,
  loadedUrl: string,
  fallbackTitle: string | undefined,
  options: WebsiteContentCrawlerOptions,
): ParsedPage {
  const $ = cheerio.load(html || "<html><body></body></html>");
  for (const selector of [...DEFAULT_REMOVE_SELECTORS, ...options.remove_selectors]) {
    $(selector).remove();
  }

  const root = selectContentRoot($, options.extract_selector);
  const canonicalUrl = absoluteAttribute($("link[rel='canonical']").first().attr("href"), loadedUrl);
  const title = firstText(
    $("meta[property='og:title']").attr("content"),
    $("title").first().text(),
    fallbackTitle,
  );
  const description = firstText(
    $("meta[name='description']").attr("content"),
    $("meta[property='og:description']").attr("content"),
  );
  const languageCode = firstText($("html").attr("lang"))?.split("-")[0].toLowerCase() ?? null;
  const markdown = markdownFromRoot($, root);
  const text = textFromRoot($, root, markdown);
  const cleanedHtml = (root.html() ?? "").trim();
  const links = $("a[href]")
    .map((_, element) => absoluteAttribute($(element).attr("href"), loadedUrl))
    .get()
    .filter((href): href is string => Boolean(href))
    .map(normalizeUrl)
    .filter(isHttpUrl);

  return {
    canonicalUrl,
    title,
    description,
    languageCode,
    text,
    markdown,
    html: cleanedHtml,
    links: Array.from(new Set(links)),
  };
}

function selectContentRoot($: cheerio.CheerioAPI, selector?: string): Selection {
  if (selector) {
    const selected = $(selector).first();
    if (selected.length) return selected;
  }

  for (const candidate of ["main", "article", "[role='main']", "body"]) {
    const selected = $(candidate).first();
    if (selected.length) return selected;
  }

  return $.root();
}

function markdownFromRoot($: cheerio.CheerioAPI, root: Selection): string {
  const blocks: string[] = [];
  root.find("h1,h2,h3,h4,h5,h6,p,li,pre,blockquote,td,th").each((_, element) => {
    const tag = (element as { tagName?: string }).tagName?.toLowerCase() ?? "";
    const node = $(element);
    const text = normalizeInline(node.text());
    if (!text) return;

    if (/^h[1-6]$/.test(tag)) {
      blocks.push(`${"#".repeat(Number(tag[1]))} ${text}`);
    } else if (tag === "li") {
      blocks.push(`- ${text}`);
    } else if (tag === "pre") {
      blocks.push(`\`\`\`\n${node.text().trim()}\n\`\`\``);
    } else if (tag === "blockquote") {
      blocks.push(text.split("\n").map((line) => `> ${line}`).join("\n"));
    } else {
      blocks.push(text);
    }
  });

  if (blocks.length === 0) {
    const fallback = normalizeInline(root.text());
    return fallback;
  }

  return normalizeBlocks(blocks.join("\n\n"));
}

function textFromRoot(
  $: cheerio.CheerioAPI,
  root: Selection,
  markdown: string,
): string {
  const blocks: string[] = [];
  root.find("h1,h2,h3,h4,h5,h6,p,li,pre,blockquote,td,th").each((_, element) => {
    const text = normalizeInline($(element).text());
    if (text) blocks.push(text);
  });
  const fromBlocks = normalizeBlocks(blocks.join("\n\n"));
  if (fromBlocks) return fromBlocks;
  return normalizeBlocks(markdown.replace(/^#{1,6}\s+/gm, "").replace(/^-\s+/gm, ""));
}

function toError(
  item: QueueItem,
  loadedTime: string,
  error: string,
  message: string,
  statusCode: number | null,
): WebsiteContentCrawlerError {
  return {
    url: item.url,
    loadedTime,
    referrerUrl: item.referrerUrl,
    depth: item.depth,
    error,
    message,
    statusCode,
  };
}

function withinAnyStartScope(
  candidate: string,
  startUrls: string[],
  scope: WebsiteContentCrawlerOptions["scope"],
): boolean {
  return startUrls.some((startUrl) => withinScope(candidate, startUrl, scope));
}

function withinScope(
  candidate: string,
  startUrl: string,
  scope: WebsiteContentCrawlerOptions["scope"],
): boolean {
  const current = new URL(candidate);
  const start = new URL(startUrl);
  if (current.origin !== start.origin) return false;
  if (scope === "origin") return true;
  if (scope === "page") return stripHash(current.href) === stripHash(start.href);
  return current.pathname.startsWith(scopePath(start.pathname));
}

function scopePath(pathname: string): string {
  if (pathname.endsWith("/")) return pathname;
  const lastSegment = pathname.split("/").pop() ?? "";
  if (lastSegment.includes(".")) {
    const parent = pathname.slice(0, Math.max(1, pathname.lastIndexOf("/") + 1));
    return parent || "/";
  }
  return `${pathname}/`;
}

function absoluteAttribute(value: string | undefined, baseUrl: string): string | null {
  if (!value) return null;
  if (value.startsWith("mailto:") || value.startsWith("tel:") || value.startsWith("javascript:")) {
    return null;
  }
  try {
    return new URL(value, baseUrl).href;
  } catch {
    return null;
  }
}

function normalizeUrl(url: string): string {
  const parsed = new URL(url);
  parsed.hash = "";
  if (parsed.pathname !== "/" && parsed.pathname.endsWith("/")) {
    parsed.pathname = parsed.pathname.slice(0, -1);
  }
  return parsed.href;
}

function stripHash(url: string): string {
  const parsed = new URL(url);
  parsed.hash = "";
  return parsed.href;
}

function isHttpUrl(value: string): boolean {
  const protocol = new URL(value).protocol;
  return protocol === "http:" || protocol === "https:";
}

function globToRegExp(glob: string): RegExp {
  let pattern = "";
  for (let i = 0; i < glob.length; i += 1) {
    const char = glob[i];
    const next = glob[i + 1];
    if (char === "*" && next === "*") {
      pattern += ".*";
      i += 1;
    } else if (char === "*") {
      pattern += "[^?]*";
    } else if (char === "?") {
      pattern += ".";
    } else {
      pattern += escapeRegExp(char);
    }
  }
  return new RegExp(`^${pattern}$`);
}

function escapeRegExp(value: string): string {
  return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

function firstText(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    const text = normalizeInline(value ?? "");
    if (text) return text;
  }
  return null;
}

function normalizeInline(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeBlocks(value: string): string {
  return value
    .split(/\n{2,}/)
    .map((block) => block.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n\n");
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
