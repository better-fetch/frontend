import * as cheerio from "cheerio";
import type { Element } from "domhandler";
import { z } from "zod";

const HTTP_URL = z
  .string()
  .url()
  .refine((value) => {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  }, "Only HTTP and HTTPS sitemap URLs can be processed");

const IMAGE_EXTENSIONS = new Set([
  "avif",
  "gif",
  "ico",
  "jpeg",
  "jpg",
  "png",
  "svg",
  "webp",
]);
const VIDEO_EXTENSIONS = new Set([
  "avi",
  "m4v",
  "mov",
  "mp4",
  "mpeg",
  "mpg",
  "webm",
  "wmv",
]);
const CHANGE_FREQUENCIES = new Set([
  "always",
  "hourly",
  "daily",
  "weekly",
  "monthly",
  "yearly",
  "never",
]);

export const SITEMAP_URL_EXTRACTOR_INPUT_SCHEMA = z.object({
  sitemapUrls: z.array(HTTP_URL).min(1).max(50),
  maxUrls: z.number().int().min(1).max(100_000).default(10_000),
});

export const SITEMAP_URL_EXTRACTOR_MCP_INPUT_SCHEMA = {
  sitemapUrls: z
    .array(HTTP_URL)
    .min(1)
    .max(50)
    .describe("One or more XML sitemap URLs to parse"),
  maxUrls: z
    .number()
    .int()
    .min(1)
    .max(100_000)
    .optional()
    .describe("Maximum URL rows to extract across all sitemaps (default 10000)"),
};

export type SitemapUrlExtractorInput = z.input<
  typeof SITEMAP_URL_EXTRACTOR_INPUT_SCHEMA
>;
export type SitemapUrlExtractorOptions = z.output<
  typeof SITEMAP_URL_EXTRACTOR_INPUT_SCHEMA
>;

export type SitemapUrlExtractorFetchRequest = {
  url: string;
  timeoutSecs: number;
};

export type SitemapUrlExtractorFetchResult = {
  ok?: boolean;
  error?: string;
  message?: string;
  status?: number;
  final_url?: string;
  body_text?: string | null;
  html?: string | null;
};

export type SitemapUrlExtractorFetch = (
  request: SitemapUrlExtractorFetchRequest,
) => Promise<SitemapUrlExtractorFetchResult>;

export type SitemapUrlRecord = {
  url: string;
  sitemapSource: string;
  lastModified: string | null;
  changeFrequency: string | null;
  priority: number | null;
  isImage: boolean;
  isVideo: boolean;
  imageCount: number;
};

export type SitemapUrlExtractorError = {
  sitemapUrl: string;
  depth: number;
  error: string;
  statusCode: number | null;
};

type CrawlState = {
  options: SitemapUrlExtractorOptions;
  fetchSitemap: SitemapUrlExtractorFetch;
  seenSitemaps: Set<string>;
  records: SitemapUrlRecord[];
  errors: SitemapUrlExtractorError[];
};

export async function extractSitemapUrls(
  input: SitemapUrlExtractorInput,
  fetchSitemap: SitemapUrlExtractorFetch,
) {
  const options = SITEMAP_URL_EXTRACTOR_INPUT_SCHEMA.parse(input);
  const state: CrawlState = {
    options,
    fetchSitemap,
    seenSitemaps: new Set(),
    records: [],
    errors: [],
  };

  for (const sitemapUrl of options.sitemapUrls.map(normalizeUrl)) {
    if (state.records.length >= options.maxUrls) break;
    await processSitemap(sitemapUrl, 0, state);
  }

  return {
    ok: state.errors.length === 0,
    actor: "sitemap_url_extractor",
    item_count: state.records.length,
    items: state.records,
    errors: state.errors,
  };
}

async function processSitemap(
  sitemapUrl: string,
  depth: number,
  state: CrawlState,
) {
  if (depth > 3) return;
  if (state.seenSitemaps.has(sitemapUrl)) return;
  if (state.records.length >= state.options.maxUrls) return;
  state.seenSitemaps.add(sitemapUrl);

  let response: SitemapUrlExtractorFetchResult;
  try {
    response = await state.fetchSitemap({ url: sitemapUrl, timeoutSecs: 30 });
  } catch (error) {
    state.errors.push({
      sitemapUrl,
      depth,
      error: errorMessage(error),
      statusCode: null,
    });
    return;
  }

  if (response.ok === false) {
    state.errors.push({
      sitemapUrl,
      depth,
      error: response.error ?? response.message ?? "fetch failed",
      statusCode: response.status ?? null,
    });
    return;
  }

  const loadedUrl = normalizeUrl(response.final_url ?? sitemapUrl);
  const xml = response.body_text ?? response.html ?? "";
  const parsed = parseSitemapXml(xml, loadedUrl);
  if (parsed.kind === "invalid") {
    state.errors.push({
      sitemapUrl: loadedUrl,
      depth,
      error: parsed.error,
      statusCode: response.status ?? null,
    });
    return;
  }

  if (parsed.kind === "index") {
    for (const child of parsed.sitemaps) {
      if (state.records.length >= state.options.maxUrls) break;
      await processSitemap(child, depth + 1, state);
    }
    return;
  }

  for (const record of parsed.urls) {
    if (state.records.length >= state.options.maxUrls) break;
    state.records.push(record);
  }
}

function parseSitemapXml(
  xml: string,
  sitemapSource: string,
):
  | { kind: "index"; sitemaps: string[] }
  | { kind: "urlset"; urls: SitemapUrlRecord[] }
  | { kind: "invalid"; error: string } {
  const $ = cheerio.load(xml, { xmlMode: true });
  const sitemapNodes = $("sitemap");
  const urlNodes = $("url");

  if (sitemapNodes.length > 0) {
    const sitemaps = sitemapNodes
      .map((_, node) => absoluteUrl($(node).find("loc").first().text(), sitemapSource))
      .get()
      .filter((url): url is string => Boolean(url));
    return { kind: "index", sitemaps };
  }

  if (urlNodes.length > 0) {
    const urls = urlNodes
      .map((_, node) => parseUrlNode($, node, sitemapSource))
      .get()
      .filter((record): record is SitemapUrlRecord => Boolean(record));
    return { kind: "urlset", urls };
  }

  return { kind: "invalid", error: "invalid XML sitemap: no urlset or sitemapindex entries" };
}

function parseUrlNode(
  $: cheerio.CheerioAPI,
  node: Element,
  sitemapSource: string,
): SitemapUrlRecord | null {
  const current = $(node);
  const url = absoluteUrl(current.children("loc").first().text(), sitemapSource);
  if (!url) return null;

  const imageCount = current.find("image\\:image, image").length;
  const videoCount = current.find("video\\:video, video").length;
  const priorityText = normalizeText(current.children("priority").first().text());
  const priority = priorityText ? Number.parseFloat(priorityText) : null;
  const frequency = normalizeText(current.children("changefreq").first().text()).toLowerCase();

  return {
    url,
    sitemapSource,
    lastModified: normalizeText(current.children("lastmod").first().text()) || null,
    changeFrequency: CHANGE_FREQUENCIES.has(frequency) ? frequency : frequency || null,
    priority: Number.isFinite(priority) ? priority : null,
    isImage: imageCount > 0 || hasExtension(url, IMAGE_EXTENSIONS),
    isVideo: videoCount > 0 || hasExtension(url, VIDEO_EXTENSIONS),
    imageCount,
  };
}

function hasExtension(url: string, extensions: Set<string>) {
  const pathname = new URL(url).pathname;
  const ext = pathname.split(".").pop()?.toLowerCase() ?? "";
  return extensions.has(ext);
}

function absoluteUrl(value: string, baseUrl: string): string | null {
  const text = normalizeText(value);
  if (!text) return null;
  try {
    const parsed = new URL(text, baseUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    parsed.hash = "";
    return parsed.href;
  } catch {
    return null;
  }
}

function normalizeUrl(url: string): string {
  const parsed = new URL(url);
  parsed.hash = "";
  return parsed.href;
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
