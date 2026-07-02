import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";
import type { AnyNode } from "domhandler";
import { z } from "zod";

const TARGET_INPUT = z.string().trim().min(1).max(2_048);
const COUNTRY_CODE = z
  .string()
  .trim()
  .regex(/^[a-z]{2}$/i, "Use a two-letter country code")
  .transform((value) => value.toLowerCase());
const LANGUAGE_CODE = z
  .string()
  .trim()
  .regex(/^[a-z]{2}(-[a-z]{2})?$/i, "Use a language code like en or en-US")
  .transform((value) => value.toLowerCase());

export const META_ADS_LIBRARY_INPUT_SCHEMA = z.object({
  targets: z.array(TARGET_INPUT).min(1).max(100),
  maxAdsPerTarget: z.number().int().min(1).max(500).default(50),
  countryCode: COUNTRY_CODE.default("us"),
  languageCode: LANGUAGE_CODE.default("en"),
  activeStatus: z.enum(["active", "inactive", "all"]).default("active"),
  mediaType: z.enum(["all", "image", "video", "meme", "none"]).default("all"),
  strategy: z.enum(["auto", "http", "browser"]).default("browser"),
  timeoutSecs: z.number().int().min(5).max(180).default(60),
});

export const META_ADS_LIBRARY_MCP_INPUT_SCHEMA = {
  targets: z
    .array(TARGET_INPUT)
    .min(1)
    .max(100)
    .describe("Meta Ads Library URLs, Facebook page IDs like page:12345, numeric page IDs, or keyword searches"),
  maxAdsPerTarget: z
    .number()
    .int()
    .min(1)
    .max(500)
    .optional()
    .describe("Maximum ads returned for each target (default 50)"),
  countryCode: COUNTRY_CODE.optional().describe("Two-letter country code (default us)"),
  languageCode: LANGUAGE_CODE.optional().describe("Language code like en or en-US (default en)"),
  activeStatus: z
    .enum(["active", "inactive", "all"])
    .optional()
    .describe("Ad status filter (default active)"),
  mediaType: z
    .enum(["all", "image", "video", "meme", "none"])
    .optional()
    .describe("Creative media type filter (default all)"),
  strategy: z
    .enum(["auto", "http", "browser"])
    .optional()
    .describe("Better Fetch strategy for each Ads Library page (default browser)"),
  timeoutSecs: z
    .number()
    .int()
    .min(5)
    .max(180)
    .optional()
    .describe("Per-target timeout in seconds (default 60)"),
};

export type MetaAdsLibraryInput = z.input<typeof META_ADS_LIBRARY_INPUT_SCHEMA>;
export type MetaAdsLibraryOptions = z.output<typeof META_ADS_LIBRARY_INPUT_SCHEMA>;

export type MetaAdsLibraryFetchRequest = {
  url: string;
  timeoutSecs: number;
  strategy: "auto" | "http" | "browser";
  countryCode: string;
  languageCode: string;
};

export type MetaAdsLibraryFetchResult = {
  ok?: boolean;
  error?: string;
  message?: string;
  status?: number;
  final_url?: string;
  html?: string | null;
  body_text?: string | null;
  title?: string | null;
};

export type MetaAdsLibraryFetch = (
  request: MetaAdsLibraryFetchRequest,
) => Promise<MetaAdsLibraryFetchResult>;

export type MetaAdRange = {
  lower: number | null;
  upper: number | null;
};

export type MetaAd = {
  position: number;
  libraryId: string | null;
  pageId: string | null;
  pageName: string | null;
  pageProfileUrl: string | null;
  isActive: boolean | null;
  startDate: string | null;
  endDate: string | null;
  platforms: string[];
  adText: string | null;
  headline: string | null;
  description: string | null;
  callToAction: string | null;
  destinationUrl: string | null;
  displayUrl: string | null;
  snapshotUrl: string | null;
  mediaUrls: string[];
  videoUrls: string[];
  spend: MetaAdRange | null;
  impressions: MetaAdRange | null;
  reach: MetaAdRange | null;
  currency: string | null;
  countries: string[];
  languages: string[];
  categories: string[];
};

export type MetaAdsLibraryRecord = {
  target: {
    input: string;
    inputIndex: number;
    url: string;
    finalUrl: string;
    type: "LIBRARY_URL" | "PAGE_ID" | "KEYWORD";
    countryCode: string;
    languageCode: string;
    activeStatus: string;
    mediaType: string;
  };
  ads: MetaAd[];
};

export type MetaAdsLibraryError = {
  input: string;
  inputIndex: number;
  url: string | null;
  error: string;
  statusCode: number | null;
};

type TargetRequest = {
  input: string;
  inputIndex: number;
  url: string;
  type: "LIBRARY_URL" | "PAGE_ID" | "KEYWORD";
};

type AdSeed = {
  ad_archive_id?: unknown;
  adArchiveID?: unknown;
  archive_id?: unknown;
  id?: unknown;
  page_id?: unknown;
  pageId?: unknown;
  page_name?: unknown;
  pageName?: unknown;
  advertiser?: unknown;
  snapshot?: unknown;
  body?: unknown;
  ad_creative_bodies?: unknown;
  headline?: unknown;
  title?: unknown;
  link_description?: unknown;
  description?: unknown;
  cta_text?: unknown;
  ctaText?: unknown;
  link_url?: unknown;
  linkUrl?: unknown;
  url?: unknown;
  page_profile_uri?: unknown;
  pageProfileUri?: unknown;
  is_active?: unknown;
  isActive?: unknown;
  start_date?: unknown;
  startDate?: unknown;
  end_date?: unknown;
  endDate?: unknown;
  publisher_platform?: unknown;
  publisher_platforms?: unknown;
  publisherPlatforms?: unknown;
  platforms?: unknown;
  spend?: unknown;
  spend_range?: unknown;
  impressions?: unknown;
  impressions_range?: unknown;
  reach?: unknown;
  reach_estimate?: unknown;
  currency?: unknown;
  images?: unknown;
  videos?: unknown;
  cards?: unknown;
  countries?: unknown;
  languages?: unknown;
  categories?: unknown;
  ad_snapshot_url?: unknown;
  snapshotUrl?: unknown;
};

export async function scrapeMetaAdsLibrary(
  input: MetaAdsLibraryInput,
  fetchLibraryPage: MetaAdsLibraryFetch,
) {
  const options = META_ADS_LIBRARY_INPUT_SCHEMA.parse(input);
  const results: MetaAdsLibraryRecord[] = [];
  const errors: MetaAdsLibraryError[] = [];

  for (const [index, target] of options.targets.entries()) {
    let request: TargetRequest;
    try {
      request = buildTargetRequest(target, index + 1, options);
    } catch (error) {
      errors.push({
        input: target,
        inputIndex: index + 1,
        url: null,
        error: errorMessage(error),
        statusCode: null,
      });
      continue;
    }

    let response: MetaAdsLibraryFetchResult;
    try {
      response = await fetchLibraryPage({
        url: request.url,
        timeoutSecs: options.timeoutSecs,
        strategy: options.strategy,
        countryCode: options.countryCode,
        languageCode: options.languageCode,
      });
    } catch (error) {
      errors.push(errorRecord(request, errorMessage(error), null));
      continue;
    }

    if (response.ok === false) {
      errors.push(
        errorRecord(
          request,
          response.error ?? response.message ?? "fetch failed",
          response.status ?? null,
        ),
      );
      continue;
    }

    const html = response.html ?? response.body_text ?? "";
    const finalUrl = normalizeUrl(response.final_url ?? request.url);
    const ads = parseMetaAds(html, finalUrl).slice(0, options.maxAdsPerTarget);

    if (looksBlocked(html) && ads.length === 0) {
      errors.push(
        errorRecord(
          request,
          "meta ads library page appears blocked, unavailable, or login-gated",
          response.status ?? null,
        ),
      );
      continue;
    }

    if (ads.length === 0) {
      errors.push(
        errorRecord(
          request,
          "meta ads library page did not contain ad data",
          response.status ?? null,
        ),
      );
      continue;
    }

    results.push({
      target: {
        input: request.input,
        inputIndex: request.inputIndex,
        url: request.url,
        finalUrl,
        type: request.type,
        countryCode: options.countryCode,
        languageCode: options.languageCode,
        activeStatus: options.activeStatus,
        mediaType: options.mediaType,
      },
      ads,
    });
  }

  const adCount = results.reduce((total, result) => total + result.ads.length, 0);
  return {
    ok: errors.length === 0,
    tool: "meta_ads_library",
    target_count: results.length,
    ad_count: adCount,
    item_count: adCount,
    results,
    errors,
  };
}

function buildTargetRequest(
  target: string,
  inputIndex: number,
  options: MetaAdsLibraryOptions,
): TargetRequest {
  const raw = target.trim();
  const inputUrl = parseInputUrl(raw);
  if (inputUrl) {
    if (!isFacebookUrl(inputUrl) || !inputUrl.pathname.startsWith("/ads/library")) {
      throw new Error("Input must be a Meta Ads Library URL, page ID, or keyword search");
    }
    return {
      input: raw,
      inputIndex,
      url: normalizeLibraryUrl(inputUrl, options),
      type: "LIBRARY_URL",
    };
  }

  const pageId = raw.match(/^(?:page:)?(\d{5,})$/i)?.[1];
  if (pageId) {
    const url = baseLibraryUrl(options);
    url.searchParams.set("search_type", "page");
    url.searchParams.set("view_all_page_id", pageId);
    return { input: raw, inputIndex, url: url.href, type: "PAGE_ID" };
  }

  const url = baseLibraryUrl(options);
  url.searchParams.set("q", raw);
  url.searchParams.set("search_type", "keyword_unordered");
  return { input: raw, inputIndex, url: url.href, type: "KEYWORD" };
}

function normalizeLibraryUrl(inputUrl: URL, options: MetaAdsLibraryOptions): string {
  const url = new URL("https://www.facebook.com/ads/library/");
  for (const [key, value] of inputUrl.searchParams.entries()) {
    url.searchParams.append(key, value);
  }
  applyDefaultFilters(url, options);
  return url.href;
}

function baseLibraryUrl(options: MetaAdsLibraryOptions): URL {
  const url = new URL("https://www.facebook.com/ads/library/");
  applyDefaultFilters(url, options);
  return url;
}

function applyDefaultFilters(url: URL, options: MetaAdsLibraryOptions) {
  if (!url.searchParams.has("active_status")) {
    url.searchParams.set("active_status", options.activeStatus);
  }
  if (!url.searchParams.has("ad_type")) url.searchParams.set("ad_type", "all");
  if (!url.searchParams.has("country")) {
    url.searchParams.set("country", options.countryCode.toUpperCase());
  }
  if (!url.searchParams.has("media_type")) {
    url.searchParams.set("media_type", options.mediaType);
  }
}

function parseMetaAds(html: string, pageUrl: string): MetaAd[] {
  const $ = cheerio.load(html);
  const jsonAds = extractEmbeddedJson($)
    .flatMap((value) => collectRecords(value))
    .filter(isAdCandidate)
    .map((record, index) => adFromSeed(record as AdSeed, pageUrl, index + 1))
    .filter(isAd);
  const domAds = adsFromDom($, pageUrl);
  return dedupeAds([...jsonAds, ...domAds]);
}

function extractEmbeddedJson($: CheerioAPI): unknown[] {
  const values: unknown[] = [];
  $("script[type='application/json'], script[type='application/ld+json'], script#__NEXT_DATA__").each(
    (_, element) => {
      const text = $(element).text().trim();
      if (!text) return;
      try {
        values.push(JSON.parse(text));
      } catch {
        // Ignore non-JSON script payloads.
      }
    },
  );
  $("script:not([src])").each((_, element) => {
    const text = $(element).text();
    if (!/ad_archive_id|adArchiveID|page_name|Meta Ad Library/i.test(text)) return;
    for (const raw of balancedJsonObjects(text)) {
      try {
        values.push(JSON.parse(raw));
      } catch {
        // Ignore malformed inline JSON snippets.
      }
    }
  });
  return values;
}

function adFromSeed(seed: AdSeed, pageUrl: string, position: number): MetaAd {
  const snapshot = isRecord(seed.snapshot) ? seed.snapshot : {};
  const advertiser = isRecord(seed.advertiser) ? seed.advertiser : {};
  const pageId =
    stringValue(seed.page_id) ??
    stringValue(seed.pageId) ??
    stringValue(advertiser.id) ??
    stringValue(snapshot.page_id);
  const pageName =
    stringValue(seed.page_name) ??
    stringValue(seed.pageName) ??
    stringValue(advertiser.name) ??
    stringValue(snapshot.page_name);
  const pageProfileUrl = normalizeExternalUrl(
    stringValue(seed.page_profile_uri) ??
      stringValue(seed.pageProfileUri) ??
      stringValue(snapshot.page_profile_uri) ??
      stringValue(snapshot.pageProfileUri),
    pageUrl,
  );
  const destinationUrl = normalizeExternalUrl(
    stringValue(seed.link_url) ??
      stringValue(seed.linkUrl) ??
      stringValue(snapshot.link_url) ??
      stringValue(snapshot.linkUrl) ??
      firstCardValue(snapshot.cards, ["link_url", "linkUrl", "url"]),
    pageUrl,
  );
  const media = mediaValues(seed, snapshot, pageUrl);
  const spend = rangeValue(seed.spend ?? seed.spend_range ?? snapshot.spend);
  const impressions = rangeValue(seed.impressions ?? seed.impressions_range ?? snapshot.impressions);
  const reach = rangeValue(seed.reach ?? seed.reach_estimate ?? snapshot.reach);
  return {
    position,
    libraryId:
      stringValue(seed.ad_archive_id) ??
      stringValue(seed.adArchiveID) ??
      stringValue(seed.archive_id) ??
      stringValue(seed.id),
    pageId,
    pageName,
    pageProfileUrl,
    isActive:
      booleanValue(seed.is_active) ??
      booleanValue(seed.isActive) ??
      booleanValue(snapshot.is_active) ??
      null,
    startDate: dateValue(seed.start_date ?? seed.startDate ?? snapshot.start_date),
    endDate: dateValue(seed.end_date ?? seed.endDate ?? snapshot.end_date),
    platforms: uniqueStrings(
      arrayStrings(seed.publisher_platforms) ??
        arrayStrings(seed.publisher_platform) ??
        arrayStrings(seed.publisherPlatforms) ??
        arrayStrings(seed.platforms) ??
        arrayStrings(snapshot.publisher_platforms) ??
        [],
    ),
    adText:
      textValue(seed.body) ??
      firstString(seed.ad_creative_bodies) ??
      textValue(snapshot.body) ??
      firstCardValue(snapshot.cards, ["body", "text"]),
    headline:
      stringValue(seed.headline) ??
      stringValue(seed.title) ??
      stringValue(snapshot.title) ??
      firstCardValue(snapshot.cards, ["title", "headline"]),
    description:
      stringValue(seed.description) ??
      stringValue(seed.link_description) ??
      stringValue(snapshot.link_description) ??
      firstCardValue(snapshot.cards, ["link_description", "description"]),
    callToAction:
      stringValue(seed.cta_text) ??
      stringValue(seed.ctaText) ??
      stringValue(snapshot.cta_text) ??
      stringValue(snapshot.ctaText) ??
      firstCardValue(snapshot.cards, ["cta_text", "ctaText"]),
    destinationUrl,
    displayUrl: stringValue(snapshot.display_url) ?? hostFromUrl(destinationUrl),
    snapshotUrl: normalizeExternalUrl(
      stringValue(seed.ad_snapshot_url) ?? stringValue(seed.snapshotUrl),
      pageUrl,
    ),
    mediaUrls: media.images,
    videoUrls: media.videos,
    spend,
    impressions,
    reach,
    currency: stringValue(seed.currency) ?? stringValue(snapshot.currency) ?? currencyFromRange(spend),
    countries: uniqueStrings(arrayStrings(seed.countries) ?? arrayStrings(snapshot.countries) ?? []),
    languages: uniqueStrings(arrayStrings(seed.languages) ?? arrayStrings(snapshot.languages) ?? []),
    categories: uniqueStrings(
      arrayStrings(seed.categories) ??
        arrayStrings(snapshot.categories) ??
        [stringValue(snapshot.page_category)].filter(isString),
    ),
  };
}

function adsFromDom($: CheerioAPI, pageUrl: string): MetaAd[] {
  const ads: MetaAd[] = [];
  const seen = new Set<AnyNode>();
  $("[data-ad-archive-id], [data-testid='ad-library-card'], article").each((_, element) => {
    if (seen.has(element)) return;
    const node = $(element);
    const text = normalizeText(node.text());
    const libraryId =
      node.attr("data-ad-archive-id") ??
      text.match(/(?:Library ID|Ad ID)[:\s]+(\d+)/i)?.[1] ??
      null;
    if (!libraryId || !/Library ID|Ad ID|Sponsored|Active|Inactive/i.test(text)) return;
    seen.add(element);
    const pageLink = node.find("a[href*='facebook.com/']").first();
    const destination = node
      .find("a[href^='http']")
      .toArray()
      .map((link) => $(link).attr("href"))
      .map((href) => normalizeExternalUrl(href, pageUrl))
      .find((href) => href && !href.includes("facebook.com/ads/library")) ?? null;
    const mediaUrls = node
      .find("img[src]")
      .toArray()
      .map((image) => normalizeExternalUrl($(image).attr("src"), pageUrl))
      .filter(isString);
    const videoUrls = node
      .find("video[src], source[src]")
      .toArray()
      .map((video) => normalizeExternalUrl($(video).attr("src"), pageUrl))
      .filter(isString);
    ads.push({
      position: ads.length + 1,
      libraryId,
      pageId: text.match(/Page ID[:\s]+(\d+)/i)?.[1] ?? null,
      pageName:
        normalizeText(pageLink.text()) ||
        text.match(/Advertiser[:\s]+([^\n]+)/i)?.[1] ||
        null,
      pageProfileUrl: normalizeExternalUrl(pageLink.attr("href"), pageUrl),
      isActive: /\bActive\b/i.test(text) ? true : /\bInactive\b/i.test(text) ? false : null,
      startDate: text.match(/Started running on\s+([^.\n]+)/i)?.[1]?.trim() ?? null,
      endDate: text.match(/Ended running on\s+([^.\n]+)/i)?.[1]?.trim() ?? null,
      platforms: platformNames(text),
      adText: text.match(/Ad text[:\s]+(.+?)(?:Headline:|Description:|CTA:|$)/is)?.[1]?.trim() ?? null,
      headline: text.match(/Headline[:\s]+(.+?)(?:Description:|CTA:|$)/is)?.[1]?.trim() ?? null,
      description: text.match(/Description[:\s]+(.+?)(?:CTA:|$)/is)?.[1]?.trim() ?? null,
      callToAction: ctaFromText(text),
      destinationUrl: destination,
      displayUrl: hostFromUrl(destination),
      snapshotUrl: normalizeExternalUrl(node.find("a[href*='/ads/library/?id=']").first().attr("href"), pageUrl),
      mediaUrls: uniqueStrings(mediaUrls),
      videoUrls: uniqueStrings(videoUrls),
      spend: null,
      impressions: null,
      reach: null,
      currency: null,
      countries: [],
      languages: [],
      categories: [],
    });
  });
  return ads;
}

function mediaValues(seed: AdSeed, snapshot: Record<string, unknown>, pageUrl: string) {
  const imageCandidates = [seed.images, snapshot.images, snapshot.image, seed.cards, snapshot.cards];
  const videoCandidates = [seed.videos, snapshot.videos, snapshot.video, seed.cards, snapshot.cards];
  const images = imageCandidates.flatMap((value) =>
    collectRecords(value).flatMap((record) =>
      [
        record.original_image_url,
        record.resized_image_url,
        record.image_url,
        record.url,
        record.uri,
      ].flatMap((item) => imageValues(item, pageUrl)),
    ),
  );
  const videos = videoCandidates.flatMap((value) =>
    collectRecords(value).flatMap((record) =>
      [
        record.video_hd_url,
        record.video_sd_url,
        record.video_url,
        record.url,
        record.uri,
      ].flatMap((item) => imageValues(item, pageUrl)),
    ),
  );
  return { images: uniqueStrings(images), videos: uniqueStrings(videos) };
}

function isAdCandidate(record: Record<string, unknown>): boolean {
  return Boolean(
    record.ad_archive_id ||
      record.adArchiveID ||
      record.archive_id ||
      (record.snapshot && (record.page_name || record.pageName || record.page_id)),
  );
}

function collectRecords(value: unknown): Record<string, unknown>[] {
  const records: Record<string, unknown>[] = [];
  const seen = new WeakSet<object>();

  function visit(item: unknown) {
    if (Array.isArray(item)) {
      for (const child of item) visit(child);
      return;
    }
    if (!isRecord(item) || seen.has(item)) return;
    seen.add(item);
    records.push(item);
    for (const child of Object.values(item)) {
      if (Array.isArray(child) || isRecord(child)) visit(child);
    }
  }

  visit(value);
  return records;
}

function balancedJsonObjects(source: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] !== "{" && source[index] !== "[") continue;
    const raw = balancedJsonValue(source, index);
    if (raw) {
      values.push(raw);
      index += raw.length - 1;
    }
  }
  return values;
}

function balancedJsonValue(source: string, start: number): string | null {
  const opening = source[start];
  const closing = opening === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }
    if (char === "\"") {
      inString = true;
      continue;
    }
    if (char === opening) depth += 1;
    if (char === closing) depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  return null;
}

function dedupeAds(ads: MetaAd[]): MetaAd[] {
  const seen = new Set<string>();
  const deduped: MetaAd[] = [];
  for (const ad of ads) {
    const key = `${ad.libraryId ?? ""}\n${ad.pageId ?? ""}\n${ad.adText ?? ""}`;
    if (!key.trim() || seen.has(key)) continue;
    seen.add(key);
    deduped.push({ ...ad, position: deduped.length + 1 });
  }
  return deduped;
}

function rangeValue(value: unknown): MetaAdRange | null {
  if (!value) return null;
  if (typeof value === "string") {
    const numbers = [...value.matchAll(/\d[\d,]*/g)].map((match) => parseNumber(match[0]));
    if (numbers.length === 0) return null;
    return { lower: numbers[0], upper: numbers[1] ?? numbers[0] };
  }
  if (isRecord(value)) {
    const lower =
      countValue(value.lower_bound) ??
      countValue(value.lowerBound) ??
      countValue(value.min) ??
      countValue(value.from);
    const upper =
      countValue(value.upper_bound) ??
      countValue(value.upperBound) ??
      countValue(value.max) ??
      countValue(value.to);
    return lower === null && upper === null ? null : { lower, upper };
  }
  return null;
}

function countValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") return parseNumber(value);
  return null;
}

function parseNumber(value: string): number | null {
  const plain = value.match(/-?\b\d[\d,]*\b/);
  if (!plain) return null;
  const number = Number.parseInt(plain[0].replace(/,/g, ""), 10);
  return Number.isFinite(number) ? number : null;
}

function currencyFromRange(range: MetaAdRange | null): string | null {
  return range ? null : null;
}

function dateValue(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value * 1000).toISOString();
  }
  if (typeof value === "string") {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) {
      return new Date(numeric * 1000).toISOString();
    }
    return normalizeText(value) || null;
  }
  return null;
}

function textValue(value: unknown): string | null {
  if (typeof value === "string") return normalizeText(value) || null;
  if (isRecord(value)) return stringValue(value.text) ?? stringValue(value.markup);
  if (Array.isArray(value)) return firstString(value);
  return null;
}

function firstString(value: unknown): string | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const text = stringValue(item);
      if (text) return text;
    }
  }
  return stringValue(value);
}

function firstCardValue(value: unknown, keys: string[]): string | null {
  for (const record of collectRecords(value)) {
    for (const key of keys) {
      const text = stringValue(record[key]);
      if (text) return text;
    }
  }
  return null;
}

function imageValues(value: unknown, baseUrl: string): string[] {
  if (typeof value === "string") {
    return [normalizeExternalUrl(value, baseUrl)].filter(isString);
  }
  if (Array.isArray(value)) return value.flatMap((item) => imageValues(item, baseUrl));
  if (isRecord(value)) return imageValues(value.url ?? value.uri, baseUrl);
  return [];
}

function arrayStrings(value: unknown): string[] | null {
  if (!value) return null;
  if (typeof value === "string") return [normalizeText(value)].filter(Boolean);
  if (Array.isArray(value)) return value.map(stringValue).filter(isString);
  return null;
}

function platformNames(value: string): string[] {
  return ["Facebook", "Instagram", "Messenger", "WhatsApp", "Threads", "Audience Network"].filter(
    (platform) => value.toLowerCase().includes(platform.toLowerCase()),
  );
}

function ctaFromText(value: string): string | null {
  const match = value.match(
    /CTA[:\s]+(Learn More|Shop Now|Sign Up|Apply Now|Subscribe|Download|Contact Us|Book Now|Get Offer|Send Message)/i,
  );
  return match?.[1] ?? null;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => normalizeText(value)).filter(Boolean))];
}

function booleanValue(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value.toLowerCase() === "true" || value.toLowerCase() === "active") return true;
    if (value.toLowerCase() === "false" || value.toLowerCase() === "inactive") return false;
  }
  return null;
}

function parseInputUrl(input: string): URL | null {
  if (!/^https?:\/\//i.test(input) && !/^(?:www\.)?facebook\.com\//i.test(input)) {
    return null;
  }
  try {
    return new URL(input);
  } catch {
    try {
      return new URL(`https://${input}`);
    } catch {
      return null;
    }
  }
}

function isFacebookUrl(url: URL): boolean {
  return /(^|\.)facebook\.com$/i.test(url.hostname);
}

function normalizeUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = "";
    return url.href;
  } catch {
    return value;
  }
}

function normalizeExternalUrl(value: string | null | undefined, baseUrl: string): string | null {
  if (!value) return null;
  try {
    return new URL(value, baseUrl || "https://www.facebook.com/").href;
  } catch {
    return null;
  }
}

function hostFromUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function looksBlocked(html: string): boolean {
  return /captcha|checkpoint|log in to facebook|you must log in|temporarily blocked|not available|content isn't available/i.test(
    html,
  );
}

function normalizeText(value: string): string {
  return cheerio.load(`<div>${value}</div>`)("div").text().replace(/\s+/g, " ").trim();
}

function stringValue(value: unknown): string | null {
  if (typeof value === "string") return normalizeText(value) || null;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (isRecord(value)) return stringValue(value.name ?? value.text ?? value.url);
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isAd(value: MetaAd | null): value is MetaAd {
  return Boolean(value?.libraryId || value?.adText || value?.pageName);
}

function errorRecord(
  request: TargetRequest,
  error: string,
  statusCode: number | null,
): MetaAdsLibraryError {
  return {
    input: request.input,
    inputIndex: request.inputIndex,
    url: request.url,
    error,
    statusCode,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
