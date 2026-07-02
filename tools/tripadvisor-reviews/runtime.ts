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

export const TRIPADVISOR_REVIEWS_INPUT_SCHEMA = z.object({
  targets: z.array(TARGET_INPUT).min(1).max(100),
  sort: z.enum(["relevance", "newest", "highest_rating", "lowest_rating"]).default("newest"),
  maxReviewsPerTarget: z.number().int().min(1).max(500).default(100),
  includeOwnerResponses: z.boolean().default(true),
  countryCode: COUNTRY_CODE.default("us"),
  languageCode: LANGUAGE_CODE.default("en"),
  strategy: z.enum(["auto", "http", "browser"]).default("browser"),
  timeoutSecs: z.number().int().min(5).max(180).default(90),
});

export const TRIPADVISOR_REVIEWS_MCP_INPUT_SCHEMA = {
  targets: z
    .array(TARGET_INPUT)
    .min(1)
    .max(100)
    .describe("Tripadvisor place URLs, review URLs, location IDs like location:12345, or search terms"),
  sort: z
    .enum(["relevance", "newest", "highest_rating", "lowest_rating"])
    .optional()
    .describe("Review sort preference (default newest)"),
  maxReviewsPerTarget: z
    .number()
    .int()
    .min(1)
    .max(500)
    .optional()
    .describe("Maximum reviews returned for each target (default 100)"),
  includeOwnerResponses: z
    .boolean()
    .optional()
    .describe("Include visible owner response fields when present (default true)"),
  countryCode: COUNTRY_CODE.optional().describe("Two-letter country code (default us)"),
  languageCode: LANGUAGE_CODE.optional().describe("Language code like en or en-US (default en)"),
  strategy: z
    .enum(["auto", "http", "browser"])
    .optional()
    .describe("Better Fetch strategy for each Tripadvisor page (default browser)"),
  timeoutSecs: z
    .number()
    .int()
    .min(5)
    .max(180)
    .optional()
    .describe("Per-target timeout in seconds (default 90)"),
};

export type TripadvisorReviewsInput = z.input<typeof TRIPADVISOR_REVIEWS_INPUT_SCHEMA>;
export type TripadvisorReviewsOptions = z.output<typeof TRIPADVISOR_REVIEWS_INPUT_SCHEMA>;

export type TripadvisorReviewsFetchRequest = {
  url: string;
  timeoutSecs: number;
  strategy: "auto" | "http" | "browser";
  countryCode: string;
  languageCode: string;
};

export type TripadvisorReviewsFetchResult = {
  ok?: boolean;
  error?: string;
  message?: string;
  status?: number;
  final_url?: string;
  html?: string | null;
  body_text?: string | null;
  title?: string | null;
};

export type TripadvisorReviewsFetch = (
  request: TripadvisorReviewsFetchRequest,
) => Promise<TripadvisorReviewsFetchResult>;

export type TripadvisorPlace = {
  name: string | null;
  category: string | null;
  address: string | null;
  rating: number | null;
  reviewCount: number | null;
  ranking: string | null;
  locationId: string | null;
  placeUrl: string | null;
  latitude: number | null;
  longitude: number | null;
};

export type TripadvisorReviewer = {
  username: string | null;
  displayName: string | null;
  profileUrl: string | null;
  avatarUrl: string | null;
  contributionCount: number | null;
  homeLocation: string | null;
};

export type TripadvisorReview = {
  position: number;
  reviewId: string | null;
  reviewUrl: string | null;
  title: string | null;
  text: string | null;
  rating: number | null;
  publishedAt: string | null;
  travelDate: string | null;
  tripType: string | null;
  language: string | null;
  helpfulVotes: number | null;
  reviewer: TripadvisorReviewer;
  ownerResponseText: string | null;
  ownerResponseDate: string | null;
  imageUrls: string[];
};

export type TripadvisorReviewsRecord = {
  target: {
    input: string;
    inputIndex: number;
    url: string;
    finalUrl: string;
    type: "URL" | "LOCATION_ID" | "SEARCH";
    sort: string;
    countryCode: string;
    languageCode: string;
  };
  place: TripadvisorPlace;
  reviews: TripadvisorReview[];
};

export type TripadvisorReviewsError = {
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
  type: "URL" | "LOCATION_ID" | "SEARCH";
};

export async function scrapeTripadvisorReviews(
  input: TripadvisorReviewsInput,
  fetchTripadvisorPage: TripadvisorReviewsFetch,
) {
  const options = TRIPADVISOR_REVIEWS_INPUT_SCHEMA.parse(input);
  const results: TripadvisorReviewsRecord[] = [];
  const errors: TripadvisorReviewsError[] = [];

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

    let response: TripadvisorReviewsFetchResult;
    try {
      response = await fetchTripadvisorPage({
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
      errors.push(
        errorRecord(request, "tripadvisor page appears blocked", response.status ?? null),
      );
      continue;
    }

    const finalUrl = normalizeUrl(response.final_url ?? request.url);
    const parsed = parseTripadvisorReviews(html, finalUrl, options);
    const reviews = parsed.reviews.slice(0, options.maxReviewsPerTarget);
    if (reviews.length === 0) {
      errors.push(
        errorRecord(
          request,
          "tripadvisor page did not contain public review data",
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
    tool: "tripadvisor_reviews",
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
  options: TripadvisorReviewsOptions,
): TargetRequest {
  const raw = target.trim();
  const inputUrl = parseInputUrl(raw);
  if (inputUrl) {
    if (!isTripadvisorUrl(inputUrl)) throw new Error("URL input must be a Tripadvisor URL");
    inputUrl.hash = "";
    inputUrl.searchParams.set("filterLang", options.languageCode);
    inputUrl.searchParams.set("sort", sortParam(options.sort));
    return {
      input: raw,
      inputIndex,
      type: "URL",
      url: normalizeUrl(inputUrl.toString()),
    };
  }

  const locationId = raw.match(/^location[:\s]+(\d{3,})$/i)?.[1] ?? raw.match(/^\d{5,}$/)?.[0];
  if (locationId) {
    const url = new URL(
      `https://www.tripadvisor.com/Location_Review-g0-d${encodeURIComponent(
        locationId,
      )}-Reviews.html`,
    );
    url.searchParams.set("filterLang", options.languageCode);
    url.searchParams.set("sort", sortParam(options.sort));
    return { input: raw, inputIndex, type: "LOCATION_ID", url: url.toString() };
  }

  const url = new URL("https://www.tripadvisor.com/Search");
  url.searchParams.set("q", raw);
  url.searchParams.set("searchSessionId", "better-fetch");
  url.searchParams.set("filterLang", options.languageCode);
  return { input: raw, inputIndex, type: "SEARCH", url: url.toString() };
}

function sortParam(sort: TripadvisorReviewsOptions["sort"]) {
  if (sort === "highest_rating") return "RATING_HIGH";
  if (sort === "lowest_rating") return "RATING_LOW";
  if (sort === "relevance") return "RELEVANCE";
  return "NEWEST";
}

function parseTripadvisorReviews(
  html: string,
  finalUrl: string,
  options: TripadvisorReviewsOptions,
): { place: TripadvisorPlace; reviews: TripadvisorReview[] } {
  const $ = cheerio.load(html || "<html><body></body></html>");
  const place = parsePlace($, finalUrl);
  const reviews = [
    ...parseHydrationReviews($, finalUrl, options),
    ...parseJsonLdReviews($, finalUrl, options),
    ...parseDomReviews($, finalUrl, options),
  ];

  const seen = new Set<string>();
  const deduped: TripadvisorReview[] = [];
  for (const review of reviews) {
    const key = `${review.reviewId ?? ""}\n${review.reviewUrl ?? ""}\n${review.reviewer.displayName ?? ""}\n${review.title ?? ""}\n${review.text ?? ""}`.toLowerCase();
    if (!review.text && !review.title && review.rating === null) continue;
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

function parsePlace($: CheerioAPI, finalUrl: string): TripadvisorPlace {
  const place: TripadvisorPlace = {
    name: cleanPlaceName(
      firstNonEmpty(
        $("meta[property='og:title']").attr("content"),
        $("meta[name='twitter:title']").attr("content"),
        $("h1").first().text(),
        $("title").first().text(),
      ),
    ),
    category: null,
    address: null,
    rating: null,
    reviewCount: null,
    ranking: null,
    locationId: locationIdFromUrl(finalUrl),
    placeUrl: normalizeUrl(finalUrl),
    latitude: null,
    longitude: null,
  };
  const text = cleanText($("body").text()) ?? "";
  place.rating = numberValue(text.match(/([0-5](?:\.\d)?)\s*(?:of 5|bubbles|stars?|rating)/i)?.[1]);
  place.reviewCount = numberValue(text.match(/([\d,]+)\s+reviews?/i)?.[1]);
  place.ranking = cleanText(text.match(/#\d+\s+of\s+\d+[^.|\n]{0,80}/i)?.[0]);

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

function mergePlaceCandidate(place: TripadvisorPlace, object: Record<string, unknown>, finalUrl: string) {
  const type = stringList(readValue(object, "@type")).join(" ").toLowerCase();
  const hasPlaceShape =
    /hotel|restaurant|touristattraction|localbusiness|place|lodgingbusiness/.test(type) ||
    readAny(object, ["locationId", "location_id", "address", "aggregateRating", "geo"]);
  if (!hasPlaceShape) return;

  place.name =
    place.name ?? cleanPlaceName(stringValue(readAny(object, ["name", "title", "placeName"])));
  place.category =
    place.category ??
    cleanText(stringValue(readAny(object, ["category", "categoryName", "type"])));
  place.address =
    place.address ??
    addressFromValue(readAny(object, ["address", "formattedAddress", "addressText"]));
  place.rating =
    place.rating ??
    numberValue(readAny(object, ["rating", "ratingValue", "aggregateRating", "averageRating"]));
  place.reviewCount =
    place.reviewCount ??
    numberValue(readAny(object, ["reviewCount", "reviewsCount", "numberOfReviews"]));
  place.locationId =
    place.locationId ??
    cleanText(stringValue(readAny(object, ["locationId", "location_id", "id"]))) ??
    locationIdFromUrl(finalUrl);
  place.ranking =
    place.ranking ??
    cleanText(stringValue(readAny(object, ["ranking", "rankingString", "rank"])));
  const geo = readAny(object, ["geo", "location", "coordinates"]);
  if (geo && typeof geo === "object") {
    const record = geo as Record<string, unknown>;
    place.latitude = place.latitude ?? numberValue(readAny(record, ["latitude", "lat"]));
    place.longitude = place.longitude ?? numberValue(readAny(record, ["longitude", "lng"]));
  }
}

function parseHydrationReviews(
  $: CheerioAPI,
  finalUrl: string,
  options: TripadvisorReviewsOptions,
): TripadvisorReview[] {
  const reviews: TripadvisorReview[] = [];
  $("script[type='application/json'], script:not([src])").each((_, element) => {
    if (($(element).attr("type") ?? "").toLowerCase() === "application/ld+json") return;
    const parsed = parseMaybeJson($(element).text());
    if (parsed === null) return;
    for (const object of collectObjects(parsed)) {
      const review = reviewFromObject(object, finalUrl, options);
      if (review) reviews.push(review);
    }
  });
  return reviews;
}

function parseJsonLdReviews(
  $: CheerioAPI,
  finalUrl: string,
  options: TripadvisorReviewsOptions,
): TripadvisorReview[] {
  const reviews: TripadvisorReview[] = [];
  $("script[type='application/ld+json']").each((_, element) => {
    const parsed = parseMaybeJson($(element).text());
    if (parsed === null) return;
    for (const object of collectObjects(parsed)) {
      const type = stringList(readValue(object, "@type")).join(" ").toLowerCase();
      if (!type.includes("review")) continue;
      const ratingObject = readAny(object, ["reviewRating", "rating"]);
      const author = readValue(object, "author");
      const authorRecord =
        author && typeof author === "object" ? (author as Record<string, unknown>) : null;
      const encodedRating = JSON.stringify(object).match(
        /"ratingValue"\s*:\s*"?([0-5](?:\.\d)?)/i,
      )?.[1];
      reviews.push({
        position: 0,
        reviewId: cleanText(stringValue(readAny(object, ["reviewId", "identifier", "@id"]))),
        reviewUrl: absoluteUrl(stringValue(readAny(object, ["url", "@id"])), finalUrl),
        title: cleanText(stringValue(readAny(object, ["name", "headline", "title"]))),
        text: cleanText(stringValue(readAny(object, ["reviewBody", "text", "description"]))),
        rating:
          reviewRatingValue(
            readAny(object, ["ratingValue", "rating", "reviewRating"]) ?? ratingObject,
          ) ?? numberValue(encodedRating),
        publishedAt: normalizeDate(stringValue(readAny(object, ["datePublished", "publishedAt"]))),
        travelDate: normalizeTravelDate(stringValue(readAny(object, ["dateVisited", "travelDate"]))),
        tripType: cleanText(stringValue(readAny(object, ["tripType", "travelerType"]))),
        language: cleanText(stringValue(readAny(object, ["inLanguage", "language"]))),
        helpfulVotes: numberValue(readAny(object, ["helpfulVotes", "likes"])),
        reviewer: {
          username: null,
          displayName: authorRecord
            ? cleanText(stringValue(readAny(authorRecord, ["name", "displayName"])))
            : cleanText(stringValue(author)),
          profileUrl: authorRecord
            ? absoluteUrl(stringValue(readAny(authorRecord, ["url", "@id"])), finalUrl)
            : null,
          avatarUrl: authorRecord
            ? absoluteUrl(firstImageValue(readAny(authorRecord, ["image", "avatar"])), finalUrl)
            : null,
          contributionCount: null,
          homeLocation: null,
        },
        ownerResponseText: null,
        ownerResponseDate: null,
        imageUrls: imageList(readAny(object, ["image", "images", "photo", "photos"]), finalUrl),
      });
    }
  });
  if (!options.includeOwnerResponses) {
    return reviews.map(stripOwnerResponse);
  }
  return reviews;
}

function parseDomReviews(
  $: CheerioAPI,
  finalUrl: string,
  options: TripadvisorReviewsOptions,
): TripadvisorReview[] {
  const reviews: TripadvisorReview[] = [];
  const selectors = [
    "[data-reviewid]",
    "[data-review-id]",
    "div[id^='review_']",
    "article[data-automation*='review']",
    "div[class*='review']",
  ];
  const seen = new Set<AnyNode>();
  for (const selector of selectors) {
    $(selector).each((_, element) => {
      if (seen.has(element)) return;
      seen.add(element);
      const node = $(element);
      const nodeText = cleanText(node.text()) ?? "";
      const title =
        cleanText(
          node
            .find(
              "[data-test-target='review-title'], a[href*='Review-'], a[href*='ShowUserReviews']",
            )
            .first()
            .text(),
        ) ??
        cleanText(node.find("q, strong, span").first().text());
      const text =
        cleanText(node.find("[data-test-target='review-text'], q, p").first().text()) ??
        nodeText;
      const rating =
        ratingFromText(
          [
            node.attr("aria-label"),
            node.find("[aria-label*='bubble'], [aria-label*='star']").first().attr("aria-label"),
            node.find("[class*='bubble_'], [class*='ui_bubble_rating']").first().attr("class"),
            nodeText,
          ].join(" "),
        ) ?? null;
      if (!text && !title && rating === null) return;
      const reviewerLink = node.find("a[href*='/Profile/']").first();
      const reviewUrl = absoluteUrl(node.find("a[href*='ShowUserReviews'], a[href*='Review-']").first().attr("href"), finalUrl);
      const reviewId =
        cleanText(node.attr("data-reviewid")) ??
        cleanText(node.attr("data-review-id")) ??
        cleanText(node.attr("id")?.replace(/^review_/, "")) ??
        reviewUrl?.match(/r(\d+)/)?.[1] ??
        null;
      const review: TripadvisorReview = {
        position: 0,
        reviewId,
        reviewUrl,
        title,
        text,
        rating,
        publishedAt: normalizeDate(nodeText.match(/(?:Written|Reviewed)\s+([A-Z][a-z]+ \d{1,2}, \d{4})/i)?.[1]),
        travelDate: normalizeTravelDate(nodeText.match(/Date of (?:stay|visit):\s*([A-Za-z]+ \d{4})/i)?.[1]),
        tripType: cleanText(nodeText.match(/Trip type:\s*([^|.]+)/i)?.[1]),
        language: null,
        helpfulVotes: numberValue(nodeText.match(/(\d+)\s+helpful votes?/i)?.[1]),
        reviewer: {
          username: usernameFromProfileUrl(reviewerLink.attr("href") ?? null),
          displayName: cleanText(reviewerLink.text()) ?? cleanText(node.find("[class*='memberName']").first().text()),
          profileUrl: absoluteUrl(reviewerLink.attr("href"), finalUrl),
          avatarUrl: absoluteUrl(node.find("img").first().attr("src"), finalUrl),
          contributionCount: numberValue(nodeText.match(/([\d,]+)\s+contributions?/i)?.[1]),
          homeLocation: cleanText(node.find("[class*='userLoc'], [class*='location']").first().text()),
        },
        ownerResponseText: options.includeOwnerResponses
          ? ownerResponseFromText(nodeText)
          : null,
        ownerResponseDate: options.includeOwnerResponses
          ? normalizeDate(nodeText.match(/Response from .+?,\s*(.+)$/i)?.[1])
          : null,
        imageUrls: node
          .find("img[src]")
          .map((_, image) => absoluteUrl($(image).attr("src"), finalUrl))
          .get()
          .filter(Boolean) as string[],
      };
      reviews.push(review);
    });
  }
  return reviews;
}

function reviewFromObject(
  object: Record<string, unknown>,
  finalUrl: string,
  options: TripadvisorReviewsOptions,
): TripadvisorReview | null {
  const explicitType = stringList(readValue(object, "__typename")).join(" ").toLowerCase();
  const schemaType = stringList(readValue(object, "@type")).join(" ").toLowerCase();
  const reviewId = cleanText(
    stringValue(readAny(object, ["reviewId", "review_id", "id", "reviewID"])),
  );
  const title = cleanText(
    stringValue(readAny(object, ["title", "reviewTitle", "headline", "name"])),
  );
  const text = cleanText(
    stringValue(readAny(object, ["text", "reviewText", "review_text", "body", "reviewBody"])),
  );
  const rating = reviewRatingValue(
    readAny(object, ["rating", "ratingValue", "bubbleRating", "score", "reviewRating"]),
  );
  const hasReviewShape =
    explicitType.includes("review") ||
    schemaType.includes("review") ||
    Boolean(readValue(object, "helpfulVotes")) ||
    (Boolean(text) && (rating !== null || Boolean(title)));
  if (!hasReviewShape) return null;

  const reviewer = readAny(object, ["reviewer", "user", "member", "author", "userProfile"]);
  const reviewerRecord =
    reviewer && typeof reviewer === "object" ? (reviewer as Record<string, unknown>) : null;
  const owner = readAny(object, ["ownerResponse", "managementResponse", "response"]);
  const ownerRecord = owner && typeof owner === "object" ? (owner as Record<string, unknown>) : null;

  const review: TripadvisorReview = {
    position: 0,
    reviewId,
    reviewUrl: absoluteUrl(stringValue(readAny(object, ["url", "reviewUrl", "review_url"])), finalUrl),
    title,
    text,
    rating,
    publishedAt: normalizeDate(
      stringValue(readAny(object, ["publishedDate", "published_at", "publishedAt", "date"])),
    ),
    travelDate: normalizeTravelDate(
      stringValue(readAny(object, ["travelDate", "dateOfStay", "dateOfVisit"])),
    ),
    tripType: cleanText(stringValue(readAny(object, ["tripType", "travelerType", "travelType"]))),
    language: cleanText(stringValue(readAny(object, ["language", "lang", "reviewLanguage"]))),
    helpfulVotes: numberValue(readAny(object, ["helpfulVotes", "helpfulVoteCount", "likes"])),
    reviewer: {
      username: reviewerRecord
        ? cleanText(stringValue(readAny(reviewerRecord, ["username", "userName", "screenName"])))
        : usernameFromProfileUrl(stringValue(reviewer)),
      displayName: reviewerRecord
        ? cleanText(stringValue(readAny(reviewerRecord, ["displayName", "name", "username"])))
        : cleanText(stringValue(reviewer)),
      profileUrl: reviewerRecord
        ? absoluteUrl(stringValue(readAny(reviewerRecord, ["profileUrl", "url", "link"])), finalUrl)
        : null,
      avatarUrl: reviewerRecord
        ? absoluteUrl(firstImageValue(readAny(reviewerRecord, ["avatar", "avatarUrl", "image", "photo"])), finalUrl)
        : null,
      contributionCount: reviewerRecord
        ? numberValue(readAny(reviewerRecord, ["contributionCount", "contributions", "reviewCount"]))
        : null,
      homeLocation: reviewerRecord
        ? cleanText(stringValue(readAny(reviewerRecord, ["homeLocation", "location", "hometown"])))
        : null,
    },
    ownerResponseText:
      options.includeOwnerResponses && ownerRecord
        ? cleanText(stringValue(readAny(ownerRecord, ["text", "body", "response"])))
        : options.includeOwnerResponses
          ? cleanText(stringValue(owner))
          : null,
    ownerResponseDate:
      options.includeOwnerResponses && ownerRecord
        ? normalizeDate(stringValue(readAny(ownerRecord, ["date", "publishedDate", "publishedAt"])))
        : null,
    imageUrls: imageList(readAny(object, ["images", "imageUrls", "photos", "media"]), finalUrl),
  };
  return review;
}

function stripOwnerResponse(review: TripadvisorReview): TripadvisorReview {
  return { ...review, ownerResponseText: null, ownerResponseDate: null };
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
    const match = value.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
    if (!match) return null;
    const number = Number(match[0]);
    return Number.isFinite(number) ? number : null;
  }
  if (value && typeof value === "object") {
    return numberValue(readAny(value as Record<string, unknown>, ["ratingValue", "value", "count"]));
  }
  return null;
}

function ratingFromText(value: string): number | null {
  const bubbleClass = value.match(/bubble_(\d{2})/i)?.[1];
  if (bubbleClass) return Number(bubbleClass) / 10;
  return numberValue(value.match(/([0-5](?:\.\d)?)/)?.[1]);
}

function reviewRatingValue(value: unknown): number | null {
  const direct = numberValue(value);
  if (direct !== null) return direct;
  if (value && typeof value === "object") {
    const encoded = JSON.stringify(value);
    const match = encoded.match(/"ratingValue"\s*:\s*"?([0-5](?:\.\d)?)/i);
    return numberValue(match?.[1]);
  }
  return null;
}

function imageList(value: unknown, baseUrl: string): string[] {
  if (Array.isArray(value)) {
    return Array.from(new Set(value.flatMap((item) => imageList(item, baseUrl))));
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

function addressFromValue(value: unknown): string | null {
  if (typeof value === "string") return cleanText(value);
  if (!value || typeof value !== "object") return null;
  const object = value as Record<string, unknown>;
  const parts = [
    stringValue(readAny(object, ["streetAddress", "street"])),
    stringValue(readAny(object, ["addressLocality", "city"])),
    stringValue(readAny(object, ["addressRegion", "state"])),
    stringValue(readAny(object, ["postalCode", "zip"])),
    stringValue(readAny(object, ["addressCountry", "country"])),
  ]
    .map((part) => cleanText(part))
    .filter(Boolean);
  return parts.length ? parts.join(", ") : cleanText(stringValue(readAny(object, ["text", "name"])));
}

function ownerResponseFromText(text: string): string | null {
  const normalized = cleanText(text) ?? "";
  const match = normalized.match(/(?:Management response|Response from .+?)\s*(.+)$/i);
  return cleanText(match?.[1]);
}

function usernameFromProfileUrl(value: string | null | undefined): string | null {
  const url = absoluteUrl(value, "https://www.tripadvisor.com/");
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const profile = parsed.pathname.match(/\/Profile\/([^/?#]+)/i)?.[1];
    return profile ? decodeURIComponent(profile) : null;
  } catch {
    return null;
  }
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

function normalizeTravelDate(value: string | null | undefined): string | null {
  const text = cleanText(value);
  if (!text) return null;
  const monthYear = text.match(/^([A-Z][a-z]+)\s+(\d{4})$/);
  if (monthYear) {
    const monthIndex = MONTH_INDEX[monthYear[1].toLowerCase()];
    if (monthIndex !== undefined) {
      return new Date(Date.UTC(Number(monthYear[2]), monthIndex, 1)).toISOString();
    }
  }
  const date = new Date(text);
  return Number.isNaN(date.valueOf()) ? text : date.toISOString();
}

const MONTH_INDEX: Record<string, number> = {
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11,
};

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

function isTripadvisorUrl(url: URL) {
  return /(^|\.)tripadvisor\.[a-z.]+$/i.test(url.hostname);
}

function normalizeUrl(value: string): string {
  const url = new URL(value);
  url.hash = "";
  return url.toString();
}

function locationIdFromUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.pathname.match(/-d(\d+)-/i)?.[1] ?? url.searchParams.get("locationId");
  } catch {
    return null;
  }
}

function cleanPlaceName(value: string | null | undefined): string | null {
  const text = cleanText(value);
  if (!text) return null;
  return cleanText(
    text
      .replace(/\s*-\s*Tripadvisor.*$/i, "")
      .replace(/\s*:\s*Read Reviews.*$/i, "")
      .replace(/\s*\|\s*Tripadvisor.*$/i, ""),
  );
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
    text.includes("access denied") ||
    text.includes("temporarily blocked") ||
    text.includes("enable javascript and cookies") ||
    text.includes("unusual traffic")
  );
}

function errorRecord(
  request: TargetRequest,
  error: string,
  statusCode: number | null,
): TripadvisorReviewsError {
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
