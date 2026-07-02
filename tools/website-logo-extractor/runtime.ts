import { createHash } from "node:crypto";
import * as cheerio from "cheerio";
import { z } from "zod";

const HTTP_URL = z
  .string()
  .url()
  .refine((value) => {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  }, "Only HTTP and HTTPS URLs can be processed");

export const WEBSITE_LOGO_EXTRACTOR_INPUT_SCHEMA = z.object({
  urls: z.array(HTTP_URL).min(1).max(50),
  maxConcurrency: z.number().int().min(1).max(50).default(10),
  timeoutSecs: z.number().int().min(5).max(120).default(30),
  strategy: z.enum(["auto", "http", "browser"]).default("http"),
  includeManifestIcons: z.boolean().default(true),
});

export const WEBSITE_LOGO_EXTRACTOR_MCP_INPUT_SCHEMA = {
  urls: z
    .array(HTTP_URL)
    .min(1)
    .max(50)
    .describe("Website URLs to extract logo-related image assets from"),
  maxConcurrency: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .describe("Maximum concurrent URL processing (default 10, max 50)"),
  timeoutSecs: z
    .number()
    .int()
    .min(5)
    .max(120)
    .optional()
    .describe("Per-URL timeout in seconds (default 30)"),
  strategy: z
    .enum(["auto", "http", "browser"])
    .optional()
    .describe("Better Fetch strategy for each page (default http)"),
  includeManifestIcons: z
    .boolean()
    .optional()
    .describe("Fetch linked manifest.json files and include declared icons (default true)"),
};

export type WebsiteLogoExtractorInput = z.input<
  typeof WEBSITE_LOGO_EXTRACTOR_INPUT_SCHEMA
>;
export type WebsiteLogoExtractorOptions = z.output<
  typeof WEBSITE_LOGO_EXTRACTOR_INPUT_SCHEMA
>;

export type WebsiteLogoExtractorFetchRequest = {
  url: string;
  responseKind: "html" | "json";
  timeoutSecs: number;
  strategy: "auto" | "http" | "browser";
};

export type WebsiteLogoExtractorFetchResult = {
  ok?: boolean;
  error?: string;
  message?: string;
  status?: number;
  final_url?: string;
  title?: string;
  html?: string | null;
  body_text?: string | null;
};

export type WebsiteLogoExtractorFetch = (
  request: WebsiteLogoExtractorFetchRequest,
) => Promise<WebsiteLogoExtractorFetchResult>;

export type WebsiteLogo = {
  url: string | null;
  type:
    | "favicon"
    | "favicon-default"
    | "og-image"
    | "twitter-image"
    | "schema-org"
    | "img-logo"
    | "svg-inline"
    | "manifest-icon";
  size: string | null;
  source: string;
  html?: string;
};

export type WebsiteLogoExtractorResult = {
  url: string;
  logoCount: number;
  logos: WebsiteLogo[];
  error?: string;
};

export async function extractWebsiteLogos(
  input: WebsiteLogoExtractorInput,
  fetchResource: WebsiteLogoExtractorFetch,
) {
  const options = WEBSITE_LOGO_EXTRACTOR_INPUT_SCHEMA.parse(input);
  const results = await mapWithConcurrency(
    options.urls.map(normalizeUrl),
    options.maxConcurrency,
    (url) => extractOne(url, options, fetchResource),
  );

  return {
    ok: results.every((result) => !result.error),
    tool: "website_logo_extractor",
    item_count: results.length,
    results,
  };
}

async function extractOne(
  url: string,
  options: WebsiteLogoExtractorOptions,
  fetchResource: WebsiteLogoExtractorFetch,
): Promise<WebsiteLogoExtractorResult> {
  let fetched: WebsiteLogoExtractorFetchResult;
  try {
    fetched = await fetchResource({
      url,
      responseKind: "html",
      timeoutSecs: options.timeoutSecs,
      strategy: options.strategy,
    });
  } catch (error) {
    return emptyResult(url, errorMessage(error));
  }

  if (fetched.ok === false) {
    return emptyResult(url, fetched.error ?? fetched.message ?? "fetch failed");
  }

  const loadedUrl = normalizeUrl(fetched.final_url ?? url);
  const html = fetched.html ?? fetched.body_text ?? "";
  const $ = cheerio.load(html || "<html><body></body></html>");
  const logos: WebsiteLogo[] = [];

  collectLinkIcons($, loadedUrl, logos);
  collectDefaultFavicon(loadedUrl, logos);
  collectMetaImages($, loadedUrl, logos);
  collectSchemaOrgLogos($, loadedUrl, logos);
  collectLogoImages($, loadedUrl, logos);
  collectInlineSvgs($, logos);

  if (options.includeManifestIcons) {
    await collectManifestIcons($, loadedUrl, logos, options, fetchResource);
  }

  const deduped = dedupeLogos(logos);
  return { url, logoCount: deduped.length, logos: deduped };
}

function collectLinkIcons(
  $: cheerio.CheerioAPI,
  baseUrl: string,
  logos: WebsiteLogo[],
) {
  $("link[rel]").each((_, element) => {
    const rel = ($(element).attr("rel") ?? "").toLowerCase();
    if (!rel.includes("icon")) return;
    const href = absoluteAttribute($(element).attr("href"), baseUrl);
    if (!href) return;
    logos.push({
      url: href,
      type: "favicon",
      size: normalizeSize($(element).attr("sizes")),
      source: `link[rel="${rel}"]`,
    });
  });
}

function collectDefaultFavicon(baseUrl: string, logos: WebsiteLogo[]) {
  const origin = new URL(baseUrl).origin;
  logos.push({
    url: `${origin}/favicon.ico`,
    type: "favicon-default",
    size: null,
    source: "/favicon.ico",
  });
}

function collectMetaImages(
  $: cheerio.CheerioAPI,
  baseUrl: string,
  logos: WebsiteLogo[],
) {
  for (const selector of [
    "meta[property='og:image']",
    "meta[property='og:image:url']",
    "meta[name='og:image']",
  ]) {
    const url = absoluteAttribute($(selector).first().attr("content"), baseUrl);
    if (url) logos.push({ url, type: "og-image", size: null, source: selector });
  }

  for (const selector of [
    "meta[name='twitter:image']",
    "meta[property='twitter:image']",
  ]) {
    const url = absoluteAttribute($(selector).first().attr("content"), baseUrl);
    if (url) logos.push({ url, type: "twitter-image", size: null, source: selector });
  }
}

function collectSchemaOrgLogos(
  $: cheerio.CheerioAPI,
  baseUrl: string,
  logos: WebsiteLogo[],
) {
  $("script[type='application/ld+json']").each((_, element) => {
    const raw = $(element).text();
    if (!raw.trim()) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }
    for (const logo of findSchemaLogoValues(parsed)) {
      const url = absoluteAttribute(logo, baseUrl);
      if (url) logos.push({ url, type: "schema-org", size: null, source: "json-ld" });
    }
  });
}

function collectLogoImages(
  $: cheerio.CheerioAPI,
  baseUrl: string,
  logos: WebsiteLogo[],
) {
  $("img").each((_, element) => {
    const node = $(element);
    const haystack = [
      node.attr("src"),
      node.attr("data-src"),
      node.attr("srcset"),
      node.attr("alt"),
      node.attr("class"),
      node.attr("id"),
      node.attr("title"),
      node.attr("aria-label"),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (!haystack.includes("logo")) return;
    const asset =
      firstSrcsetUrl(node.attr("srcset"), baseUrl) ??
      absoluteAttribute(node.attr("src"), baseUrl) ??
      absoluteAttribute(node.attr("data-src"), baseUrl);
    if (!asset) return;
    logos.push({
      url: asset,
      type: "img-logo",
      size: attrSize(node.attr("width"), node.attr("height")),
      source: "img",
    });
  });
}

function collectInlineSvgs($: cheerio.CheerioAPI, logos: WebsiteLogo[]) {
  $("header svg, nav svg, [role='banner'] svg").each((_, element) => {
    const html = $.html(element).trim();
    if (!html) return;
    logos.push({
      url: null,
      type: "svg-inline",
      size: null,
      source: "header/nav svg",
      html,
    });
  });
}

async function collectManifestIcons(
  $: cheerio.CheerioAPI,
  baseUrl: string,
  logos: WebsiteLogo[],
  options: WebsiteLogoExtractorOptions,
  fetchResource: WebsiteLogoExtractorFetch,
) {
  const manifestUrl = absoluteAttribute(
    $("link[rel='manifest']").first().attr("href"),
    baseUrl,
  );
  if (!manifestUrl) return;

  let manifestResponse: WebsiteLogoExtractorFetchResult;
  try {
    manifestResponse = await fetchResource({
      url: manifestUrl,
      responseKind: "json",
      timeoutSecs: options.timeoutSecs,
      strategy: "http",
    });
  } catch {
    return;
  }
  if (manifestResponse.ok === false) return;

  const raw = manifestResponse.body_text ?? manifestResponse.html ?? "";
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return;
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.icons)) return;

  for (const icon of parsed.icons) {
    if (!isRecord(icon) || typeof icon.src !== "string") continue;
    const src = absoluteAttribute(icon.src, manifestUrl);
    if (!src) continue;
    logos.push({
      url: src,
      type: "manifest-icon",
      size: typeof icon.sizes === "string" ? normalizeSize(icon.sizes) : null,
      source: "manifest.json",
    });
  }
}

function findSchemaLogoValues(value: unknown): string[] {
  if (typeof value === "string") return [];
  if (Array.isArray(value)) return value.flatMap(findSchemaLogoValues);
  if (!isRecord(value)) return [];

  const logos: string[] = [];
  const direct = value.logo;
  if (typeof direct === "string") {
    logos.push(direct);
  } else if (Array.isArray(direct)) {
    logos.push(...direct.flatMap(extractLogoUrlFromRecord));
  } else {
    logos.push(...extractLogoUrlFromRecord(direct));
  }

  for (const child of Object.values(value)) {
    if (child !== direct) logos.push(...findSchemaLogoValues(child));
  }
  return logos;
}

function extractLogoUrlFromRecord(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (!isRecord(value)) return [];
  return [value.url, value.contentUrl]
    .filter((candidate): candidate is string => typeof candidate === "string");
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let index = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (index < items.length) {
        const current = index;
        index += 1;
        results[current] = await mapper(items[current]);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

function dedupeLogos(logos: WebsiteLogo[]): WebsiteLogo[] {
  const seen = new Set<string>();
  const deduped: WebsiteLogo[] = [];
  for (const logo of logos) {
    const key = logo.url
      ? logo.url.toLowerCase()
      : `inline:${createHash("sha1").update(logo.html ?? "").digest("hex")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(logo);
  }
  return deduped;
}

function normalizeUrl(url: string): string {
  const parsed = new URL(url);
  parsed.hash = "";
  return parsed.href;
}

function absoluteAttribute(value: string | undefined, baseUrl: string): string | null {
  if (!value) return null;
  if (value.startsWith("data:")) return null;
  try {
    const parsed = new URL(value, baseUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    parsed.hash = "";
    return parsed.href;
  } catch {
    return null;
  }
}

function firstSrcsetUrl(srcset: string | undefined, baseUrl: string): string | null {
  if (!srcset) return null;
  const first = srcset.split(",")[0]?.trim().split(/\s+/)[0];
  return absoluteAttribute(first, baseUrl);
}

function attrSize(width: string | undefined, height: string | undefined): string | null {
  if (!width || !height) return null;
  const w = Number.parseInt(width, 10);
  const h = Number.parseInt(height, 10);
  if (!Number.isFinite(w) || !Number.isFinite(h)) return null;
  return `${w}x${h}`;
}

function normalizeSize(value: string | undefined): string | null {
  const text = value?.trim();
  if (!text || text === "any") return null;
  return text;
}

function emptyResult(url: string, error: string): WebsiteLogoExtractorResult {
  return { url, logoCount: 0, logos: [], error };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
