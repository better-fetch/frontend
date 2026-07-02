import * as cheerio from "cheerio";
import type { Element } from "domhandler";
import { z } from "zod";

const SEARCH_INPUT = z.string().trim().min(1).max(2_048);
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

export const GOOGLE_MAPS_PLACES_INPUT_SCHEMA = z.object({
  searches: z.array(SEARCH_INPUT).min(1).max(50),
  countryCode: COUNTRY_CODE.default("us"),
  languageCode: LANGUAGE_CODE.default("en"),
  maxPlacesPerSearch: z.number().int().min(1).max(500).default(40),
  strategy: z.enum(["auto", "http", "browser"]).default("browser"),
  timeoutSecs: z.number().int().min(5).max(180).default(90),
});

export const GOOGLE_MAPS_PLACES_MCP_INPUT_SCHEMA = {
  searches: z
    .array(SEARCH_INPUT)
    .min(1)
    .max(50)
    .describe("Google Maps search terms, location searches, or raw Google Maps URLs"),
  countryCode: COUNTRY_CODE.optional().describe("Two-letter country code (default us)"),
  languageCode: LANGUAGE_CODE.optional().describe("Language code like en or en-US (default en)"),
  maxPlacesPerSearch: z
    .number()
    .int()
    .min(1)
    .max(500)
    .optional()
    .describe("Maximum place rows to return per search (default 40)"),
  strategy: z
    .enum(["auto", "http", "browser"])
    .optional()
    .describe("Better Fetch strategy for each Maps page (default browser)"),
  timeoutSecs: z
    .number()
    .int()
    .min(5)
    .max(180)
    .optional()
    .describe("Per-search timeout in seconds (default 90)"),
};

export type GoogleMapsPlacesInput = z.input<typeof GOOGLE_MAPS_PLACES_INPUT_SCHEMA>;
export type GoogleMapsPlacesOptions = z.output<typeof GOOGLE_MAPS_PLACES_INPUT_SCHEMA>;

export type GoogleMapsPlacesFetchRequest = {
  url: string;
  timeoutSecs: number;
  strategy: "auto" | "http" | "browser";
  countryCode: string;
  languageCode: string;
};

export type GoogleMapsPlacesFetchResult = {
  ok?: boolean;
  error?: string;
  message?: string;
  status?: number;
  final_url?: string;
  html?: string | null;
  body_text?: string | null;
  title?: string | null;
};

export type GoogleMapsPlacesFetch = (
  request: GoogleMapsPlacesFetchRequest,
) => Promise<GoogleMapsPlacesFetchResult>;

export type GoogleMapsPlace = {
  position: number;
  title: string;
  category: string | null;
  address: string | null;
  phone: string | null;
  website: string | null;
  rating: number | null;
  reviewCount: number | null;
  priceLevel: string | null;
  placeUrl: string | null;
  placeId: string | null;
  latitude: number | null;
  longitude: number | null;
};

export type GoogleMapsPlacesSearchRecord = {
  search: {
    query: string;
    url: string;
    type: "SEARCH" | "URL";
    countryCode: string;
    languageCode: string;
  };
  places: GoogleMapsPlace[];
};

export type GoogleMapsPlacesError = {
  search: string;
  searchIndex: number;
  url: string | null;
  error: string;
  statusCode: number | null;
};

type SearchRequest = {
  source: string;
  searchIndex: number;
  url: string;
  type: "SEARCH" | "URL";
};

export async function scrapeGoogleMapsPlaces(
  input: GoogleMapsPlacesInput,
  fetchMapsPage: GoogleMapsPlacesFetch,
) {
  const options = GOOGLE_MAPS_PLACES_INPUT_SCHEMA.parse(input);
  const results: GoogleMapsPlacesSearchRecord[] = [];
  const errors: GoogleMapsPlacesError[] = [];

  for (const [index, source] of options.searches.entries()) {
    let request: SearchRequest;
    try {
      request = buildMapsRequest(source, index + 1, options);
    } catch (error) {
      errors.push({
        search: source,
        searchIndex: index + 1,
        url: null,
        error: errorMessage(error),
        statusCode: null,
      });
      continue;
    }

    let response: GoogleMapsPlacesFetchResult;
    try {
      response = await fetchMapsPage({
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
    if (looksBlocked(html)) {
      errors.push(errorRecord(request, "maps page appears blocked", response.status ?? null));
      continue;
    }

    const url = normalizeUrl(response.final_url ?? request.url);
    const places = parseMapsPlaces(html, url).slice(0, options.maxPlacesPerSearch);
    results.push({
      search: {
        query: request.source,
        url,
        type: request.type,
        countryCode: options.countryCode.toUpperCase(),
        languageCode: options.languageCode,
      },
      places,
    });
  }

  return {
    ok: errors.length === 0,
    actor: "google_maps_places",
    search_count: results.length,
    item_count: results.reduce((total, result) => total + result.places.length, 0),
    results,
    errors,
  };
}

function buildMapsRequest(
  source: string,
  searchIndex: number,
  options: GoogleMapsPlacesOptions,
): SearchRequest {
  const raw = source.trim();
  const inputUrl = parseInputUrl(raw);
  if (inputUrl && !isGoogleMapsUrl(inputUrl)) {
    throw new Error("URL input must be a Google Maps URL");
  }

  if (inputUrl) {
    inputUrl.searchParams.set("hl", options.languageCode);
    inputUrl.searchParams.set("gl", options.countryCode);
    inputUrl.hash = "";
    return { source: raw, searchIndex, url: inputUrl.href, type: "URL" };
  }

  const encoded = encodeURIComponent(raw).replace(/%20/g, "+");
  const url = new URL(`https://www.google.com/maps/search/${encoded}`);
  url.searchParams.set("hl", options.languageCode);
  url.searchParams.set("gl", options.countryCode);
  return { source: raw, searchIndex, url: url.href, type: "SEARCH" };
}

function parseMapsPlaces(html: string, baseUrl: string): GoogleMapsPlace[] {
  const $ = cheerio.load(html);
  const cardNodes = placeCardNodes($);
  const places = cardNodes.length > 0
    ? cardNodes.map((node, index) => parsePlaceCard($, node, baseUrl, index + 1))
    : parseJsonLdPlaces($, baseUrl);

  const seen = new Set<string>();
  const deduped: GoogleMapsPlace[] = [];
  for (const place of places) {
    if (!place?.title) continue;
    const key = `${place.title}\n${place.address ?? ""}\n${place.placeUrl ?? ""}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push({ ...place, position: deduped.length + 1 });
  }
  return deduped;
}

function placeCardNodes($: cheerio.CheerioAPI): Element[] {
  const selectors = [
    "div.Nv2PK",
    "div[role='article']",
    "div[jsaction*='mouseover:pane']",
    "div[data-result-index]",
  ];
  const nodes: Element[] = [];
  const seen = new Set<Element>();
  for (const selector of selectors) {
    $(selector).each((_, element) => {
      if (element.type !== "tag") return;
      const card = element as Element;
      if (seen.has(card)) return;
      const node = $(card);
      if (!placeTitle(node)) return;
      seen.add(card);
      nodes.push(card);
    });
  }
  return nodes;
}

function parsePlaceCard(
  $: cheerio.CheerioAPI,
  element: Element,
  baseUrl: string,
  position: number,
): GoogleMapsPlace {
  const node = $(element);
  const placeUrl = normalizeMapsLink(
    node.find("a[href*='/maps/place'], a[href*='google.com/maps/place']").first().attr("href"),
    baseUrl,
  );
  const chunks = textChunks($, node);
  const coordinates = coordinatesFromUrl(placeUrl ?? baseUrl);
  const ratingText =
    node.find("[aria-label*='stars'], [aria-label*='star']").first().attr("aria-label") ??
    chunks.find((chunk) => /\b\d(?:\.\d)?\s+stars?\b/i.test(chunk)) ??
    "";
  const reviewText =
    chunks.find((chunk) => /\(?[\d,]+\)?\s*(reviews?)?/i.test(chunk) && /\(|review/i.test(chunk)) ??
    "";

  const title = placeTitle(node) ?? "";

  return {
    position,
    title,
    category: attrText(node, "data-category") ?? inferCategory(chunks, title),
    address: attrText(node, "data-address") ?? inferAddress(chunks),
    phone: attrText(node, "data-phone") ?? inferPhone(chunks),
    website: normalizeExternalUrl(
      node.find("a[data-value='Website'], a[aria-label^='Website'], a[href^='http']")
        .toArray()
        .map((link) => $(link).attr("href"))
        .find((href) => Boolean(href) && !isGoogleUrl(href!)),
      baseUrl,
    ),
    rating: parseRating(ratingText || chunks.join(" ")),
    reviewCount: parseReviewCount(reviewText || chunks.join(" ")),
    priceLevel: chunks.find((chunk) => /^\${1,4}$/.test(chunk)) ?? null,
    placeUrl,
    placeId: attrText(node, "data-place-id") ?? attrText(node, "data-cid"),
    latitude: coordinates?.latitude ?? null,
    longitude: coordinates?.longitude ?? null,
  };
}

function parseJsonLdPlaces($: cheerio.CheerioAPI, baseUrl: string): GoogleMapsPlace[] {
  const places: GoogleMapsPlace[] = [];
  $("script[type='application/ld+json']").each((_, element) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse($(element).text());
    } catch {
      return;
    }
    for (const item of flattenJsonLd(parsed)) {
      if (!isRecord(item)) continue;
      const type = item["@type"];
      const typeValues = Array.isArray(type) ? type : [type];
      if (!typeValues.some((value) => typeof value === "string" && /business|place|organization/i.test(value))) {
        continue;
      }
      const geo = isRecord(item.geo) ? item.geo : {};
      const address = typeof item.address === "string"
        ? item.address
        : isRecord(item.address)
          ? [item.address.streetAddress, item.address.addressLocality, item.address.addressRegion, item.address.postalCode]
              .filter((value): value is string => typeof value === "string" && Boolean(value.trim()))
              .join(", ")
          : null;
      const rating = isRecord(item.aggregateRating)
        ? parseRating(String(item.aggregateRating.ratingValue ?? ""))
        : null;
      const reviewCount = isRecord(item.aggregateRating)
        ? parseReviewCount(String(item.aggregateRating.reviewCount ?? ""))
        : null;
      places.push({
        position: places.length + 1,
        title: stringValue(item.name) ?? "",
        category: typeValues.find((value): value is string => typeof value === "string") ?? null,
        address: address || null,
        phone: stringValue(item.telephone),
        website: normalizeExternalUrl(stringValue(item.url), baseUrl),
        rating,
        reviewCount,
        priceLevel: stringValue(item.priceRange),
        placeUrl: normalizeMapsLink(stringValue(item.hasMap), baseUrl),
        placeId: stringValue(item.identifier),
        latitude: numberValue(geo.latitude),
        longitude: numberValue(geo.longitude),
      });
    }
  });
  return places;
}

function flattenJsonLd(value: unknown): unknown[] {
  if (Array.isArray(value)) return value.flatMap(flattenJsonLd);
  if (!isRecord(value)) return [];
  const graph = value["@graph"];
  return [value, ...(Array.isArray(graph) ? graph.flatMap(flattenJsonLd) : [])];
}

function placeTitle(node: cheerio.Cheerio<Element>): string | null {
  const ariaLabel = attrText(node, "aria-label");
  if (ariaLabel) return ariaLabel;

  const heading = normalizeText(
    node.find(".qBF1Pd, .fontHeadlineSmall, [role='heading']").first().text(),
  );
  return heading || null;
}

function textChunks($: cheerio.CheerioAPI, node: cheerio.Cheerio<Element>): string[] {
  const chunks = new Set<string>();
  node.find("span, div, button").each((_, child) => {
    const text = normalizeText($(child).text());
    if (text && text.length <= 180) chunks.add(text);
  });
  return [...chunks];
}

function inferCategory(chunks: string[], title = ""): string | null {
  for (const chunk of chunks) {
    const part = chunk.split("·")[0]?.trim();
    if (
      part &&
      part.toLowerCase() !== title.toLowerCase() &&
      !/\d/.test(part) &&
      !/open|closed|reviews?|stars?|website|directions|call/i.test(part)
    ) {
      return part;
    }
  }
  return null;
}

function inferAddress(chunks: string[]): string | null {
  const address = chunks.find(
    (chunk) =>
      /\d/.test(chunk) &&
      /\b(st|street|rd|road|ave|avenue|blvd|drive|dr|lane|ln|way|pde|parade)\b/i.test(chunk),
  );
  if (!address) return null;
  return address.split("·").at(-1)?.trim() || address;
}

function inferPhone(chunks: string[]): string | null {
  return chunks.find((chunk) => /(?:\+?\d[\d\s().-]{6,}\d)/.test(chunk)) ?? null;
}

function parseRating(value: string): number | null {
  const match = value.match(/\b([1-5](?:\.\d)?)\b/);
  if (!match) return null;
  const rating = Number.parseFloat(match[1]);
  return Number.isFinite(rating) ? rating : null;
}

function parseReviewCount(value: string): number | null {
  const match =
    value.match(/\(([\d,]+)\)/) ??
    value.match(/\b([\d,]+)\s+reviews?\b/i) ??
    value.match(/reviewCount["':\s]+([\d,]+)/i) ??
    value.match(/^([\d,]+)$/);
  if (!match) return null;
  const count = Number.parseInt(match[1].replace(/,/g, ""), 10);
  return Number.isFinite(count) ? count : null;
}

function coordinatesFromUrl(url: string): { latitude: number; longitude: number } | null {
  const match =
    url.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/) ??
    url.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),/);
  if (!match) return null;
  const latitude = Number.parseFloat(match[1]);
  const longitude = Number.parseFloat(match[2]);
  return Number.isFinite(latitude) && Number.isFinite(longitude)
    ? { latitude, longitude }
    : null;
}

function normalizeMapsLink(value: string | null | undefined, baseUrl: string): string | null {
  const url = normalizeExternalUrl(value, baseUrl);
  if (!url) return null;
  return isGoogleUrl(url) ? url : null;
}

function normalizeExternalUrl(value: string | null | undefined, baseUrl: string): string | null {
  if (!value || value.startsWith("data:")) return null;
  try {
    const parsed = new URL(value, baseUrl);
    const target = parsed.searchParams.get("q") || parsed.searchParams.get("url");
    const finalUrl = target && parsed.pathname === "/url" ? new URL(target, baseUrl) : parsed;
    if (finalUrl.protocol !== "http:" && finalUrl.protocol !== "https:") return null;
    finalUrl.hash = "";
    return finalUrl.href;
  } catch {
    return null;
  }
}

function isGoogleMapsUrl(url: URL) {
  const hostname = url.hostname.replace(/^www\./, "").toLowerCase();
  return (hostname.startsWith("google.") || hostname.endsWith(".google.com")) &&
    url.pathname.startsWith("/maps");
}

function isGoogleUrl(value: string) {
  try {
    const hostname = new URL(value).hostname.replace(/^www\./, "").toLowerCase();
    return hostname.startsWith("google.") || hostname.endsWith(".google.com");
  } catch {
    return false;
  }
}

function parseInputUrl(value: string): URL | null {
  if (!/^https?:\/\//i.test(value)) return null;
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function looksBlocked(html: string) {
  return /unusual traffic|sorry\/index|detected unusual traffic|captcha/i.test(html);
}

function attrText(node: cheerio.Cheerio<Element>, name: string): string | null {
  return normalizeText(node.attr(name) ?? "") || null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const number = Number.parseFloat(String(value));
  return Number.isFinite(number) ? number : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeUrl(url: string) {
  const parsed = new URL(url);
  parsed.hash = "";
  return parsed.href;
}

function errorRecord(
  request: SearchRequest,
  error: string,
  statusCode: number | null,
): GoogleMapsPlacesError {
  return {
    search: request.source,
    searchIndex: request.searchIndex,
    url: request.url,
    error,
    statusCode,
  };
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
