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

export const GOOGLE_MAPS_REVIEWS_INPUT_SCHEMA = z.object({
  targets: z.array(TARGET_INPUT).min(1).max(100),
  sort: z.enum(["most_relevant", "newest", "highest_rating", "lowest_rating"]).default("newest"),
  maxReviewsPerTarget: z.number().int().min(1).max(500).default(100),
  countryCode: COUNTRY_CODE.default("us"),
  languageCode: LANGUAGE_CODE.default("en"),
  strategy: z.enum(["auto", "http", "browser"]).default("browser"),
  timeoutSecs: z.number().int().min(5).max(180).default(90),
});

export const GOOGLE_MAPS_REVIEWS_MCP_INPUT_SCHEMA = {
  targets: z
    .array(TARGET_INPUT)
    .min(1)
    .max(100)
    .describe("Google Maps place URLs, review URLs, CID/place IDs like cid:123, or location searches"),
  sort: z
    .enum(["most_relevant", "newest", "highest_rating", "lowest_rating"])
    .optional()
    .describe("Review sort preference (default newest)"),
  maxReviewsPerTarget: z
    .number()
    .int()
    .min(1)
    .max(500)
    .optional()
    .describe("Maximum reviews returned for each target (default 100)"),
  countryCode: COUNTRY_CODE.optional().describe("Two-letter country code (default us)"),
  languageCode: LANGUAGE_CODE.optional().describe("Language code like en or en-US (default en)"),
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
    .describe("Per-target timeout in seconds (default 90)"),
};

export type GoogleMapsReviewsInput = z.input<typeof GOOGLE_MAPS_REVIEWS_INPUT_SCHEMA>;
export type GoogleMapsReviewsOptions = z.output<typeof GOOGLE_MAPS_REVIEWS_INPUT_SCHEMA>;

export type GoogleMapsReviewsFetchRequest = {
  url: string;
  timeoutSecs: number;
  strategy: "auto" | "http" | "browser";
  countryCode: string;
  languageCode: string;
};

export type GoogleMapsReviewsFetchResult = {
  ok?: boolean;
  error?: string;
  message?: string;
  status?: number;
  final_url?: string;
  html?: string | null;
  body_text?: string | null;
  title?: string | null;
};

export type GoogleMapsReviewsFetch = (
  request: GoogleMapsReviewsFetchRequest,
) => Promise<GoogleMapsReviewsFetchResult>;

export type GoogleMapsReviewsPlace = {
  title: string | null;
  category: string | null;
  address: string | null;
  rating: number | null;
  reviewCount: number | null;
  placeUrl: string | null;
  placeId: string | null;
  latitude: number | null;
  longitude: number | null;
};

export type GoogleMapsReview = {
  position: number;
  reviewId: string | null;
  reviewUrl: string | null;
  rating: number | null;
  text: string | null;
  language: string | null;
  publishedAt: string | null;
  relativeDate: string | null;
  likeCount: number | null;
  reviewerName: string | null;
  reviewerProfileUrl: string | null;
  reviewerReviewCount: number | null;
  reviewerPhotoUrl: string | null;
  ownerResponseText: string | null;
  ownerResponseDate: string | null;
  imageUrls: string[];
};

export type GoogleMapsReviewsRecord = {
  target: {
    input: string;
    inputIndex: number;
    url: string;
    finalUrl: string;
    type: "URL" | "CID" | "PLACE_ID" | "SEARCH";
    sort: string;
    countryCode: string;
    languageCode: string;
  };
  place: GoogleMapsReviewsPlace;
  reviews: GoogleMapsReview[];
};

export type GoogleMapsReviewsError = {
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
  type: "URL" | "CID" | "PLACE_ID" | "SEARCH";
};

export async function scrapeGoogleMapsReviews(
  input: GoogleMapsReviewsInput,
  fetchMapsPage: GoogleMapsReviewsFetch,
) {
  const options = GOOGLE_MAPS_REVIEWS_INPUT_SCHEMA.parse(input);
  const results: GoogleMapsReviewsRecord[] = [];
  const errors: GoogleMapsReviewsError[] = [];

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

    let response: GoogleMapsReviewsFetchResult;
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

    const finalUrl = normalizeUrl(response.final_url ?? request.url);
    const parsed = parseMapsReviews(html, finalUrl, options);
    const reviews = parsed.reviews.slice(0, options.maxReviewsPerTarget);
    if (reviews.length === 0) {
      errors.push(
        errorRecord(request, "maps page did not contain public review data", response.status ?? null),
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
        sort: options.sort,
        countryCode: options.countryCode.toUpperCase(),
        languageCode: options.languageCode,
      },
      place: parsed.place,
      reviews,
    });
  }

  const reviewCount = results.reduce((total, result) => total + result.reviews.length, 0);
  return {
    ok: errors.length === 0,
    tool: "google_maps_reviews",
    target_count: results.length,
    review_count: reviewCount,
    item_count: reviewCount,
    results,
    errors,
  };
}

function buildTargetRequest(
  target: string,
  inputIndex: number,
  options: GoogleMapsReviewsOptions,
): TargetRequest {
  const raw = target.trim();
  const url = parseInputUrl(raw);
  if (url) {
    if (!isGoogleMapsUrl(url)) throw new Error("URL input must be a Google Maps URL");
    url.searchParams.set("hl", options.languageCode);
    url.searchParams.set("gl", options.countryCode);
    url.hash = "";
    return {
      input: raw,
      inputIndex,
      type: "URL",
      url: normalizeUrl(url.toString()),
    };
  }

  const cid = raw.match(/^cid[:\s]+(\d{6,})$/i)?.[1] ?? raw.match(/^\d{10,}$/)?.[0];
  if (cid) {
    const mapsUrl = new URL("https://www.google.com/maps");
    mapsUrl.searchParams.set("cid", cid);
    mapsUrl.searchParams.set("hl", options.languageCode);
    mapsUrl.searchParams.set("gl", options.countryCode);
    return { input: raw, inputIndex, type: "CID", url: mapsUrl.toString() };
  }

  const placeId = raw.match(/^place_id[:\s]+([a-zA-Z0-9_-]{10,})$/i)?.[1];
  if (placeId) {
    const mapsUrl = new URL(`https://www.google.com/maps/place/`);
    mapsUrl.searchParams.set("q", `place_id:${placeId}`);
    mapsUrl.searchParams.set("hl", options.languageCode);
    mapsUrl.searchParams.set("gl", options.countryCode);
    return { input: raw, inputIndex, type: "PLACE_ID", url: mapsUrl.toString() };
  }

  const encoded = encodeURIComponent(raw).replace(/%20/g, "+");
  const mapsUrl = new URL(`https://www.google.com/maps/search/${encoded}`);
  mapsUrl.searchParams.set("hl", options.languageCode);
  mapsUrl.searchParams.set("gl", options.countryCode);
  return { input: raw, inputIndex, type: "SEARCH", url: mapsUrl.toString() };
}

function parseMapsReviews(
  html: string,
  finalUrl: string,
  options: GoogleMapsReviewsOptions,
): { place: GoogleMapsReviewsPlace; reviews: GoogleMapsReview[] } {
  const $ = cheerio.load(html || "<html><body></body></html>");
  const place = parsePlace($, finalUrl);
  const reviews = [
    ...parseHydrationReviews($, finalUrl),
    ...parseJsonLdReviews($, finalUrl),
    ...parseDomReviews($, finalUrl),
  ];

  const seen = new Set<string>();
  const deduped: GoogleMapsReview[] = [];
  for (const review of reviews) {
    const key = `${review.reviewId ?? ""}\n${review.reviewUrl ?? ""}\n${review.reviewerName ?? ""}\n${review.text ?? ""}`.toLowerCase();
    if (!review.text && !review.rating && !review.reviewerName) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push({ ...review, position: deduped.length + 1 });
  }

  if (options.sort === "highest_rating") {
    deduped.sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1));
  } else if (options.sort === "lowest_rating") {
    deduped.sort((a, b) => (a.rating ?? 6) - (b.rating ?? 6));
  }

  return {
    place,
    reviews: deduped.map((review, index) => ({ ...review, position: index + 1 })),
  };
}

function parsePlace($: CheerioAPI, finalUrl: string): GoogleMapsReviewsPlace {
  const place = emptyPlace(finalUrl);
  const title = cleanText(
    firstNonEmpty(
      $("meta[property='og:title']").attr("content"),
      $("meta[name='twitter:title']").attr("content"),
      $("h1").first().text(),
      $("title").first().text(),
    ),
  );
  place.title = cleanPlaceTitle(title);
  place.placeUrl = normalizeUrl(finalUrl);
  place.placeId = extractPlaceId(finalUrl);
  const text = cleanText($("body").text()) ?? "";
  const rating = text.match(/([0-5](?:\.\d)?)\s*(?:stars?|star rating|rating)/i);
  place.rating = rating ? Number(rating[1]) : null;
  const reviewCount = text.match(/([\d,]+)\s+reviews?/i);
  place.reviewCount = reviewCount ? Number(reviewCount[1].replace(/,/g, "")) : null;

  $("script[type='application/json'], script[type='application/ld+json'], script:not([src])").each(
    (_, element) => {
      const parsed = parseMaybeJson($(element).text());
      if (parsed === null) return;
      for (const object of collectObjects(parsed)) {
        mergePlaceCandidate(place, object, finalUrl);
      }
    },
  );
  return place;
}

function emptyPlace(finalUrl: string): GoogleMapsReviewsPlace {
  return {
    title: null,
    category: null,
    address: null,
    rating: null,
    reviewCount: null,
    placeUrl: normalizeUrl(finalUrl),
    placeId: extractPlaceId(finalUrl),
    latitude: null,
    longitude: null,
  };
}

function mergePlaceCandidate(
  place: GoogleMapsReviewsPlace,
  object: Record<string, unknown>,
  finalUrl: string,
) {
  const type = stringList(readValue(object, "@type")).join(" ").toLowerCase();
  const hasPlaceShape =
    /localbusiness|place|organization|restaurant|store/.test(type) ||
    readAny(object, ["place_id", "placeId", "placeID", "cid", "address", "location", "geo"]);
  if (!hasPlaceShape) return;
  place.title =
    place.title ??
    cleanPlaceTitle(stringValue(readAny(object, ["name", "title", "place_name"])));
  place.category =
    place.category ?? cleanText(stringValue(readAny(object, ["category", "categoryName"])));
  place.address =
    place.address ??
    cleanText(stringValue(readAny(object, ["address", "formatted_address", "addressText"])));
  place.rating =
    place.rating ??
    numberValue(
      readAny(object, ["rating", "ratingValue", "aggregateRating", "averageRating"]),
    );
  place.reviewCount =
    place.reviewCount ??
    numberValue(readAny(object, ["reviewCount", "reviewsCount", "user_ratings_total"]));
  place.placeId =
    place.placeId ??
    cleanText(stringValue(readAny(object, ["place_id", "placeId", "placeID", "cid"]))) ??
    extractPlaceId(finalUrl);
  const geo = readAny(object, ["geo", "location", "coordinates"]);
  if (geo && typeof geo === "object") {
    const record = geo as Record<string, unknown>;
    place.latitude = place.latitude ?? numberValue(readAny(record, ["latitude", "lat"]));
    place.longitude = place.longitude ?? numberValue(readAny(record, ["longitude", "lng"]));
  }
  place.latitude =
    place.latitude ?? numberValue(readAny(object, ["latitude", "lat"]));
  place.longitude =
    place.longitude ?? numberValue(readAny(object, ["longitude", "lng"]));
}

function parseHydrationReviews($: CheerioAPI, finalUrl: string): GoogleMapsReview[] {
  const reviews: GoogleMapsReview[] = [];
  $("script[type='application/json'], script:not([src])").each((_, element) => {
    const parsed = parseMaybeJson($(element).text());
    if (parsed === null) return;
    for (const object of collectObjects(parsed)) {
      const review = reviewFromObject(object, finalUrl);
      if (review) reviews.push(review);
    }
  });
  return reviews;
}

function parseJsonLdReviews($: CheerioAPI, finalUrl: string): GoogleMapsReview[] {
  const reviews: GoogleMapsReview[] = [];
  $("script[type='application/ld+json']").each((_, element) => {
    const parsed = parseMaybeJson($(element).text());
    if (parsed === null) return;
    for (const object of collectObjects(parsed)) {
      const type = stringList(readValue(object, "@type")).join(" ").toLowerCase();
      if (!type.includes("review")) continue;
      const ratingObject = readAny(object, ["reviewRating", "rating"]);
      const author = readValue(object, "author");
      const review: GoogleMapsReview = {
        position: 0,
        reviewId: cleanText(stringValue(readAny(object, ["reviewId", "identifier", "@id"]))),
        reviewUrl: absoluteUrl(stringValue(readAny(object, ["url", "@id"])), finalUrl),
        rating:
          numberValue(readAny(object, ["ratingValue", "rating"])) ??
          (ratingObject && typeof ratingObject === "object"
            ? numberValue(readAny(ratingObject as Record<string, unknown>, ["ratingValue", "value"]))
            : null),
        text: cleanText(stringValue(readAny(object, ["reviewBody", "text", "description"]))),
        language: cleanText(stringValue(readAny(object, ["inLanguage", "language"]))),
        publishedAt: normalizeDate(stringValue(readAny(object, ["datePublished", "publishedAt"]))),
        relativeDate: null,
        likeCount: null,
        reviewerName:
          author && typeof author === "object"
            ? cleanText(stringValue(readAny(author as Record<string, unknown>, ["name"])))
            : cleanText(stringValue(author)),
        reviewerProfileUrl:
          author && typeof author === "object"
            ? absoluteUrl(stringValue(readAny(author as Record<string, unknown>, ["url"])), finalUrl)
            : null,
        reviewerReviewCount: null,
        reviewerPhotoUrl:
          author && typeof author === "object"
            ? absoluteUrl(
                firstImageValue(readAny(author as Record<string, unknown>, ["image"])),
                finalUrl,
              )
            : null,
        ownerResponseText: null,
        ownerResponseDate: null,
        imageUrls: imageList(readAny(object, ["image", "images", "photo", "photos"]), finalUrl),
      };
      reviews.push(review);
    }
  });
  return reviews;
}

function parseDomReviews($: CheerioAPI, finalUrl: string): GoogleMapsReview[] {
  const reviews: GoogleMapsReview[] = [];
  const selectors = [
    "div[data-review-id]",
    "div[jscontroller][data-review-id]",
    "article[data-review-id]",
    "div[role='article']",
  ];
  const seen = new Set<AnyNode>();
  for (const selector of selectors) {
    $(selector).each((_, element) => {
      if (seen.has(element)) return;
      seen.add(element);
      const node = $(element);
      const text = cleanText(node.find("[data-expandable-section], .wiI7pd, span").first().text()) ??
        cleanText(node.text());
      const ratingText = [
        node.attr("aria-label"),
        node.find("[aria-label*='star']").first().attr("aria-label"),
        node.text(),
      ]
        .filter(Boolean)
        .join(" ");
      const rating = numberValue(ratingText.match(/([0-5](?:\.\d)?)/)?.[1]);
      const reviewerLink = node.find("a[href*='/maps/contrib/'], a[href*='contrib']").first();
      const reviewerName =
        cleanText(reviewerLink.text()) ?? cleanText(node.find("[class*='d4r55']").first().text());
      if (!text && !rating && !reviewerName) return;
      reviews.push({
        position: 0,
        reviewId: cleanText(node.attr("data-review-id")) ?? null,
        reviewUrl: absoluteUrl(node.find("a[href*='review']").first().attr("href"), finalUrl),
        rating,
        text,
        language: null,
        publishedAt: null,
        relativeDate: cleanText(node.find(".rsqaWe, [class*='rsqaWe']").first().text()),
        likeCount: numberValue(node.text().match(/(\d+)\s+(?:like|helpful)/i)?.[1]),
        reviewerName,
        reviewerProfileUrl: absoluteUrl(reviewerLink.attr("href"), finalUrl),
        reviewerReviewCount: numberValue(node.text().match(/([\d,]+)\s+reviews?/i)?.[1]),
        reviewerPhotoUrl: absoluteUrl(node.find("img").first().attr("src"), finalUrl),
        ownerResponseText: ownerResponseFromText(node.text()),
        ownerResponseDate: null,
        imageUrls: node
          .find("img[src]")
          .map((_, image) => absoluteUrl($(image).attr("src"), finalUrl))
          .get()
          .filter(Boolean) as string[],
      });
    });
  }
  return reviews;
}

function reviewFromObject(
  object: Record<string, unknown>,
  finalUrl: string,
): GoogleMapsReview | null {
  const explicitType = stringList(readValue(object, "@type")).join(" ").toLowerCase();
  const explicitReviewId = cleanText(
    stringValue(readAny(object, ["review_id", "reviewId", "review_url_id"])),
  );
  const text = cleanText(
    stringValue(
      readAny(object, ["text", "review_text", "reviewText", "comment", "description"]),
    ),
  );
  const rating = numberValue(readAny(object, ["rating", "stars", "starRating", "score"]));
  const reviewer = readAny(object, ["reviewer", "author", "user", "contributor"]);
  const reviewerRecord =
    reviewer && typeof reviewer === "object" ? (reviewer as Record<string, unknown>) : null;
  const reviewerName = reviewerRecord
    ? cleanText(stringValue(readAny(reviewerRecord, ["name", "displayName", "username"])))
    : cleanText(stringValue(reviewer));
  const id = cleanText(
    explicitReviewId ?? stringValue(readAny(object, ["id"])),
  );
  const hasReviewShape =
    explicitType.includes("review") ||
    explicitReviewId !== null ||
    (Boolean(text) && (rating !== null || reviewerName !== null));
  if (!hasReviewShape) return null;

  const owner = readAny(object, ["owner_response", "ownerResponse", "response", "reply"]);
  const ownerRecord = owner && typeof owner === "object" ? (owner as Record<string, unknown>) : null;
  return {
    position: 0,
    reviewId: id,
    reviewUrl: absoluteUrl(stringValue(readAny(object, ["review_url", "reviewUrl", "url"])), finalUrl),
    rating,
    text,
    language: cleanText(stringValue(readAny(object, ["language", "lang", "reviewLanguage"]))),
    publishedAt: normalizeDate(
      stringValue(readAny(object, ["published_at", "publishedAt", "date", "time"])),
    ),
    relativeDate: cleanText(
      stringValue(readAny(object, ["relative_time_description", "relativeDate", "timeAgo"])),
    ),
    likeCount: numberValue(readAny(object, ["likes", "likeCount", "helpfulCount"])),
    reviewerName,
    reviewerProfileUrl: reviewerRecord
      ? absoluteUrl(
          stringValue(readAny(reviewerRecord, ["profile_url", "profileUrl", "url"])),
          finalUrl,
        )
      : null,
    reviewerReviewCount: reviewerRecord
      ? numberValue(readAny(reviewerRecord, ["review_count", "reviewCount", "reviews"]))
      : null,
    reviewerPhotoUrl: reviewerRecord
      ? absoluteUrl(
          firstImageValue(readAny(reviewerRecord, ["photo_url", "photoUrl", "image", "avatar"])),
          finalUrl,
        )
      : null,
    ownerResponseText: ownerRecord
      ? cleanText(stringValue(readAny(ownerRecord, ["text", "response", "reply"])))
      : cleanText(stringValue(owner)),
    ownerResponseDate: ownerRecord
      ? normalizeDate(stringValue(readAny(ownerRecord, ["date", "publishedAt", "published_at"])))
      : null,
    imageUrls: imageList(readAny(object, ["images", "imageUrls", "photos", "media"]), finalUrl),
  };
}

function parseMaybeJson(raw: string): unknown | null {
  const text = raw.trim();
  if (!text || text.length < 2) return null;
  try {
    return JSON.parse(text);
  } catch {
    const first = text.indexOf("{");
    const last = text.lastIndexOf("}");
    if (first === -1 || last <= first) return null;
    try {
      return JSON.parse(text.slice(first, last + 1));
    } catch {
      return null;
    }
  }
}

function collectObjects(value: unknown): Record<string, unknown>[] {
  const objects: Record<string, unknown>[] = [];
  const seen = new Set<unknown>();
  const visit = (candidate: unknown) => {
    if (!candidate || typeof candidate !== "object" || seen.has(candidate)) return;
    seen.add(candidate);
    if (Array.isArray(candidate)) {
      for (const item of candidate) visit(item);
      return;
    }
    const record = candidate as Record<string, unknown>;
    objects.push(record);
    for (const item of Object.values(record)) visit(item);
  };
  visit(value);
  return objects;
}

function readAny(object: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    const value = readValue(object, key);
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

function readValue(object: Record<string, unknown>, key: string): unknown {
  if (key in object) return object[key];
  const lowerKey = key.toLowerCase();
  for (const [candidate, value] of Object.entries(object)) {
    if (candidate.toLowerCase() === lowerKey) return value;
  }
  return undefined;
}

function stringValue(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return stringValue(readAny(value as Record<string, unknown>, ["text", "value", "name", "url"]));
  }
  return null;
}

function stringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap((item) => stringList(item));
  const text = cleanText(stringValue(value));
  return text ? [text] : [];
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const match = value.match(/-?\d+(?:\.\d+)?/);
    if (!match) return null;
    const number = Number(match[0].replace(/,/g, ""));
    return Number.isFinite(number) ? number : null;
  }
  if (value && typeof value === "object") {
    return numberValue(readAny(value as Record<string, unknown>, ["ratingValue", "value", "count"]));
  }
  return null;
}

function imageList(value: unknown, baseUrl: string): string[] {
  if (Array.isArray(value)) {
    return Array.from(
      new Set(
        value
          .flatMap((item) => imageList(item, baseUrl))
          .filter(Boolean),
      ),
    );
  }
  const image = absoluteUrl(firstImageValue(value), baseUrl);
  return image ? [image] : [];
}

function firstImageValue(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    return stringValue(readAny(value as Record<string, unknown>, ["url", "src", "image", "photo"]));
  }
  return null;
}

function ownerResponseFromText(text: string): string | null {
  const normalized = cleanText(text) ?? "";
  const match = normalized.match(/Response from the owner\s*(.+)$/i);
  return cleanText(match?.[1]);
}

function normalizeDate(value: string | null | undefined): string | null {
  const text = cleanText(value);
  if (!text) return null;
  const numeric = Number(text);
  if (Number.isFinite(numeric) && numeric > 1_000_000_000) {
    return new Date(numeric < 10_000_000_000 ? numeric * 1000 : numeric).toISOString();
  }
  const date = new Date(text);
  return Number.isNaN(date.valueOf()) ? text : date.toISOString();
}

function absoluteUrl(value: string | null | undefined, baseUrl: string): string | null {
  const text = cleanText(value);
  if (!text || /^(javascript:|data:)/i.test(text)) return null;
  try {
    return normalizeUrl(new URL(text, baseUrl).toString());
  } catch {
    return null;
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

function isGoogleMapsUrl(url: URL) {
  return /(^|\.)google\.[a-z.]+$/i.test(url.hostname) && url.pathname.includes("/maps");
}

function normalizeUrl(value: string): string {
  const url = new URL(value);
  url.hash = "";
  return url.toString();
}

function extractPlaceId(value: string): string | null {
  try {
    const url = new URL(value);
    return (
      url.searchParams.get("cid") ??
      url.searchParams.get("place_id") ??
      url.pathname.match(/!1s([^!/?]+)/)?.[1] ??
      null
    );
  } catch {
    return null;
  }
}

function cleanPlaceTitle(value: string | null | undefined): string | null {
  const text = cleanText(value);
  if (!text) return null;
  return cleanText(text.replace(/\s*-\s*Google Maps.*$/i, "").replace(/\s*\|\s*Google Maps.*$/i, ""));
}

function firstNonEmpty(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    const text = cleanText(value);
    if (text) return text;
  }
  return null;
}

function cleanText(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/\\u0025/g, "%").replace(/\s+/g, " ").trim();
  return text || null;
}

function looksBlocked(html: string) {
  const text = html.toLowerCase();
  return (
    text.includes("captcha") ||
    text.includes("unusual traffic") ||
    text.includes("enable javascript and cookies") ||
    text.includes("sorry, you have been blocked")
  );
}

function errorRecord(
  request: TargetRequest,
  error: string,
  statusCode: number | null,
): GoogleMapsReviewsError {
  return {
    input: request.input,
    inputIndex: request.inputIndex,
    url: request.url,
    error,
    statusCode,
  };
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
