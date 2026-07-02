import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";
import { z } from "zod";

const PAGE_INPUT = z.string().trim().min(1).max(2_048);
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

export const FACEBOOK_PAGES_INPUT_SCHEMA = z.object({
  pages: z.array(PAGE_INPUT).min(1).max(100),
  section: z.enum(["about", "home"]).default("about"),
  maxPages: z.number().int().min(1).max(100).default(100),
  countryCode: COUNTRY_CODE.default("us"),
  languageCode: LANGUAGE_CODE.default("en"),
  strategy: z.enum(["auto", "http", "browser"]).default("browser"),
  timeoutSecs: z.number().int().min(5).max(180).default(60),
});

export const FACEBOOK_PAGES_MCP_INPUT_SCHEMA = {
  pages: z
    .array(PAGE_INPUT)
    .min(1)
    .max(100)
    .describe("Public Facebook Page/Profile URLs, numeric page IDs, or handles like nasaearth"),
  section: z
    .enum(["about", "home"])
    .optional()
    .describe("Page section to request for handle inputs and simple page URLs (default about)"),
  maxPages: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe("Maximum page targets to process from the input list (default 100)"),
  countryCode: COUNTRY_CODE.optional().describe("Two-letter country code (default us)"),
  languageCode: LANGUAGE_CODE.optional().describe("Language code like en or en-US (default en)"),
  strategy: z
    .enum(["auto", "http", "browser"])
    .optional()
    .describe("Better Fetch strategy for each Facebook page (default browser)"),
  timeoutSecs: z
    .number()
    .int()
    .min(5)
    .max(180)
    .optional()
    .describe("Per-page timeout in seconds (default 60)"),
};

export type FacebookPagesInput = z.input<typeof FACEBOOK_PAGES_INPUT_SCHEMA>;
export type FacebookPagesOptions = z.output<typeof FACEBOOK_PAGES_INPUT_SCHEMA>;

export type FacebookPagesFetchRequest = {
  url: string;
  timeoutSecs: number;
  strategy: "auto" | "http" | "browser";
  countryCode: string;
  languageCode: string;
};

export type FacebookPagesFetchResult = {
  ok?: boolean;
  error?: string;
  message?: string;
  status?: number;
  final_url?: string;
  html?: string | null;
  body_text?: string | null;
  title?: string | null;
};

export type FacebookPagesFetch = (
  request: FacebookPagesFetchRequest,
) => Promise<FacebookPagesFetchResult>;

export type FacebookPage = {
  pageId: string | null;
  username: string | null;
  title: string | null;
  canonicalUrl: string | null;
  categories: string[];
  intro: string | null;
  aboutText: string | null;
  websites: string[];
  websiteUrl: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  messengerUrl: string | null;
  likeCount: number | null;
  followerCount: number | null;
  talkingAboutCount: number | null;
  checkInCount: number | null;
  wereHereCount: number | null;
  ratingText: string | null;
  ratingValue: number | null;
  ratingCount: number | null;
  pageCreationDate: string | null;
  adStatus: string | null;
  adLibraryId: string | null;
  isRunningAds: boolean | null;
  profileImageUrl: string | null;
  coverImageUrl: string | null;
  externalLinks: string[];
};

export type FacebookPagesRecord = {
  target: {
    input: string;
    inputIndex: number;
    url: string;
    finalUrl: string;
    type: "URL" | "HANDLE" | "PAGE_ID";
    section: "about" | "home";
  };
  page: FacebookPage;
};

export type FacebookPagesError = {
  input: string;
  inputIndex: number;
  url: string | null;
  error: string;
  statusCode: number | null;
};

type PageRequest = {
  input: string;
  inputIndex: number;
  url: string;
  type: "URL" | "HANDLE" | "PAGE_ID";
};

type MutablePage = FacebookPage;

export async function scrapeFacebookPages(
  input: FacebookPagesInput,
  fetchPage: FacebookPagesFetch,
) {
  const options = FACEBOOK_PAGES_INPUT_SCHEMA.parse(input);
  const results: FacebookPagesRecord[] = [];
  const errors: FacebookPagesError[] = [];

  for (const [index, page] of options.pages.slice(0, options.maxPages).entries()) {
    let request: PageRequest;
    try {
      request = buildPageRequest(page, index + 1, options);
    } catch (error) {
      errors.push({
        input: page,
        inputIndex: index + 1,
        url: null,
        error: errorMessage(error),
        statusCode: null,
      });
      continue;
    }

    let response: FacebookPagesFetchResult;
    try {
      response = await fetchPage({
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
        errorRecord(
          request,
          "facebook page appears blocked, unavailable, or login-gated",
          response.status ?? null,
        ),
      );
      continue;
    }

    const finalUrl = normalizeUrl(response.final_url ?? request.url);
    const parsedPage = parseFacebookPage(html, finalUrl, request);
    if (!parsedPage.title && !parsedPage.intro && parsedPage.externalLinks.length === 0) {
      errors.push(
        errorRecord(request, "facebook page did not contain public page data", response.status ?? null),
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
        section: options.section,
      },
      page: parsedPage,
    });
  }

  return {
    ok: errors.length === 0,
    tool: "facebook_pages",
    page_count: results.length,
    item_count: results.length,
    results,
    errors,
  };
}

function buildPageRequest(
  page: string,
  inputIndex: number,
  options: FacebookPagesOptions,
): PageRequest {
  const raw = page.trim();
  if (/^\d{5,}$/.test(raw)) {
    return {
      input: raw,
      inputIndex,
      type: "PAGE_ID",
      url: `https://www.facebook.com/profile.php?id=${encodeURIComponent(raw)}`,
    };
  }

  if (looksLikeUrl(raw)) {
    const url = new URL(raw);
    if (!isFacebookHost(url.hostname)) {
      throw new Error("Input must be a Facebook Page/Profile URL, page ID, or handle");
    }
    url.protocol = "https:";
    url.hostname = "www.facebook.com";
    url.hash = "";
    maybeApplySection(url, options.section);
    return {
      input: raw,
      inputIndex,
      type: "URL",
      url: normalizeUrl(url.toString()),
    };
  }

  const handle = raw.replace(/^@/, "").replace(/^facebook\.com\//i, "").replace(/^\/+|\/+$/g, "");
  if (!/^[a-zA-Z0-9.]{3,80}$/.test(handle)) {
    throw new Error("Input must be a Facebook Page/Profile URL, page ID, or handle");
  }
  return {
    input: raw,
    inputIndex,
    type: "HANDLE",
    url: `https://www.facebook.com/${encodeURIComponent(handle)}${
      options.section === "about" ? "/about" : ""
    }`,
  };
}

function maybeApplySection(url: URL, section: "about" | "home") {
  if (section !== "about") return;
  if (url.pathname === "/" || url.pathname === "") return;
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length !== 1) return;
  if (parts[0] === "profile.php") return;
  url.pathname = `/${parts[0]}/about`;
}

function parseFacebookPage(html: string, finalUrl: string, request: PageRequest): FacebookPage {
  const $ = cheerio.load(html || "<html><body></body></html>");
  const page = emptyPage();

  page.canonicalUrl = firstNonEmpty(
    absoluteAttribute($("meta[property='og:url']").attr("content"), finalUrl),
    absoluteAttribute($("link[rel='canonical']").attr("href"), finalUrl),
    finalUrl,
  );
  page.username = usernameFromUrl(page.canonicalUrl ?? finalUrl) ?? usernameFromUrl(request.url);
  page.title = cleanFacebookTitle(
    firstNonEmpty(
      $("meta[property='og:title']").attr("content"),
      $("meta[name='twitter:title']").attr("content"),
      $("title").first().text(),
    ),
  );
  page.intro = cleanText(
    firstNonEmpty(
      $("meta[property='og:description']").attr("content"),
      $("meta[name='description']").attr("content"),
      $("meta[name='twitter:description']").attr("content"),
    ),
  );
  page.profileImageUrl = absoluteAttribute(
    firstNonEmpty(
      $("meta[property='og:image']").attr("content"),
      $("meta[name='twitter:image']").attr("content"),
    ),
    finalUrl,
  );

  mergeJsonLdPage($, finalUrl, page);
  mergeHydrationPage($, finalUrl, page);
  mergeDomPage($, finalUrl, page);

  page.websites = dedupeStrings(page.websites);
  page.externalLinks = dedupeStrings([...page.externalLinks, ...page.websites]);
  page.websiteUrl = page.websiteUrl ?? page.websites[0] ?? null;
  page.categories = dedupeStrings(page.categories);
  page.canonicalUrl = normalizeNullableUrl(page.canonicalUrl);
  page.profileImageUrl = normalizeNullableUrl(page.profileImageUrl);
  page.coverImageUrl = normalizeNullableUrl(page.coverImageUrl);
  page.messengerUrl = normalizeNullableUrl(page.messengerUrl);
  return page;
}

function mergeJsonLdPage($: CheerioAPI, finalUrl: string, page: MutablePage) {
  $("script[type='application/ld+json']").each((_, element) => {
    const raw = $(element).text();
    if (!raw.trim()) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }
    for (const object of collectObjects(parsed)) {
      const type = stringList(readValue(object, "@type")).join(" ").toLowerCase();
      if (
        type &&
        !/(organization|localbusiness|person|place|webpage|profilepage)/.test(type)
      ) {
        continue;
      }
      page.title = page.title ?? cleanText(stringValue(readValue(object, "name")));
      page.intro =
        page.intro ?? cleanText(stringValue(readValue(object, "description")));
      const canonical = absoluteAttribute(stringValue(readValue(object, "url")), finalUrl);
      if (canonical && isFacebookHost(new URL(canonical).hostname)) {
        page.canonicalUrl = page.canonicalUrl ?? canonical;
      } else if (canonical) {
        addUrl(page.websites, canonical);
      }
      for (const link of stringList(readValue(object, "sameAs"))) {
        addExternalUrl(page.externalLinks, link, finalUrl);
      }
      page.email = page.email ?? cleanEmail(stringValue(readValue(object, "email")));
      page.phone = page.phone ?? cleanText(stringValue(readValue(object, "telephone")));
      page.address = page.address ?? addressFromValue(readValue(object, "address"));
      page.profileImageUrl =
        page.profileImageUrl ??
        absoluteAttribute(firstImageValue(readValue(object, "image")), finalUrl) ??
        absoluteAttribute(firstImageValue(readValue(object, "logo")), finalUrl);
    }
  });
}

function mergeHydrationPage($: CheerioAPI, finalUrl: string, page: MutablePage) {
  $("script[type='application/json'], script:not([src])").each((_, element) => {
    const raw = $(element).text().trim();
    if (!raw || raw.length < 2) return;
    const parsed = parseMaybeJson(raw);
    if (parsed === null) return;

    for (const object of collectObjects(parsed)) {
      mergeObjectCandidate(object, finalUrl, page);
    }
  });
}

function mergeObjectCandidate(
  object: Record<string, unknown>,
  finalUrl: string,
  page: MutablePage,
) {
  page.pageId =
    page.pageId ??
    firstNumericString(
      readAny(object, [
        "page_id",
        "pageId",
        "pageID",
        "facebookId",
        "facebook_id",
        "profile_id",
        "profileId",
      ]),
    );
  page.username =
    page.username ??
    cleanHandle(
      stringValue(
        readAny(object, [
          "username",
          "pageName",
          "page_name",
          "vanity",
          "profile_plus_name",
        ]),
      ),
    );
  page.title =
    page.title ??
    cleanFacebookTitle(
      stringValue(readAny(object, ["title", "name", "pageTitle", "page_title"])),
    );
  page.intro =
    page.intro ??
    cleanText(
      stringValue(
        readAny(object, [
          "intro",
          "description",
          "short_description",
          "shortDescription",
          "bio",
          "subtitle",
        ]),
      ),
    );
  page.aboutText =
    page.aboutText ??
    cleanText(
      stringValue(readAny(object, ["about", "about_me", "aboutMe", "long_description"])),
    );
  page.likeCount =
    page.likeCount ??
    numberValue(readAny(object, ["likes", "like_count", "likeCount", "fan_count"]));
  page.followerCount =
    page.followerCount ??
    numberValue(
      readAny(object, [
        "followers",
        "follower_count",
        "followerCount",
        "followers_count",
        "followCount",
      ]),
    );
  page.talkingAboutCount =
    page.talkingAboutCount ??
    numberValue(
      readAny(object, [
        "talking_about_count",
        "talkingAboutCount",
        "talking_about_this",
      ]),
    );
  page.checkInCount =
    page.checkInCount ??
    numberValue(readAny(object, ["checkins", "check_ins", "checkInCount"]));
  page.wereHereCount =
    page.wereHereCount ??
    numberValue(readAny(object, ["were_here_count", "wereHereCount"]));
  page.email = page.email ?? cleanEmail(stringValue(readAny(object, ["email", "public_email"])));
  page.phone =
    page.phone ??
    cleanText(
      stringValue(readAny(object, ["phone", "phone_number", "phoneNumber", "public_phone"])),
    );
  page.address =
    page.address ??
    addressFromValue(
      readAny(object, ["address", "location", "single_line_address", "full_address"]),
    );
  page.messengerUrl =
    page.messengerUrl ??
    absoluteAttribute(
      stringValue(readAny(object, ["messenger", "messenger_link", "messengerUrl"])),
      finalUrl,
    );
  page.profileImageUrl =
    page.profileImageUrl ??
    absoluteAttribute(
      firstImageValue(
        readAny(object, [
          "profilePictureUrl",
          "profile_picture_url",
          "profile_pic_uri",
          "profilePhoto",
          "profile_picture",
          "profile_image",
        ]),
      ),
      finalUrl,
    );
  page.coverImageUrl =
    page.coverImageUrl ??
    absoluteAttribute(
      firstImageValue(
        readAny(object, ["coverPhotoUrl", "cover_photo_url", "coverPhoto", "cover_photo"]),
      ),
      finalUrl,
    );
  page.pageCreationDate =
    page.pageCreationDate ??
    cleanText(
      stringValue(
        readAny(object, ["creation_date", "creationDate", "page_creation_date"]),
      ),
    );
  page.adStatus =
    page.adStatus ??
    cleanText(stringValue(readAny(object, ["ad_status", "adStatus"])));
  const activeAds = booleanValue(
    readAny(object, ["is_business_page_active", "isRunningAds", "active_ads"]),
  );
  page.isRunningAds = page.isRunningAds ?? activeAds;
  page.adLibraryId =
    page.adLibraryId ??
    firstNumericString(
      readAny(object, ["ad_library_id", "adLibraryId", "page_ad_library_id"]),
    );
  if (!page.adLibraryId && readValue(object, "is_business_page_active") !== undefined) {
    page.adLibraryId = firstNumericString(readValue(object, "id"));
  }

  for (const category of stringList(readAny(object, ["categories", "category_list"]))) {
    addCategory(page.categories, category);
  }
  addCategory(
    page.categories,
    stringValue(readAny(object, ["category", "category_name", "page_category"])),
  );

  const rating = cleanText(stringValue(readAny(object, ["rating", "ratingText"])));
  if (rating) mergeRating(page, rating);
  page.ratingValue =
    page.ratingValue ??
    numberValue(readAny(object, ["ratingOverall", "overall_star_rating", "rating_value"]));
  page.ratingCount =
    page.ratingCount ??
    numberValue(readAny(object, ["ratingCount", "rating_count", "review_count"]));

  for (const value of stringList(readAny(object, ["websites", "website", "url", "external_url"]))) {
    addExternalUrl(page.websites, value, finalUrl);
  }
}

function mergeDomPage($: CheerioAPI, finalUrl: string, page: MutablePage) {
  const bodyText = cleanText($("body").text()) ?? "";
  if (!bodyText) return;

  page.email = page.email ?? firstEmail(bodyText);
  page.phone = page.phone ?? firstPhone(bodyText);
  page.likeCount = page.likeCount ?? metricFromText(bodyText, /([\d.,]+\s*[kmb]?)\s+likes?\b/i);
  page.followerCount =
    page.followerCount ??
    metricFromText(bodyText, /([\d.,]+\s*[kmb]?)\s+(?:followers?|people follow this)\b/i);
  page.talkingAboutCount =
    page.talkingAboutCount ??
    metricFromText(bodyText, /([\d.,]+\s*[kmb]?)\s+talking about this\b/i);
  page.checkInCount =
    page.checkInCount ??
    metricFromText(bodyText, /([\d.,]+\s*[kmb]?)\s+check-?ins?\b/i);
  page.wereHereCount =
    page.wereHereCount ??
    metricFromText(bodyText, /([\d.,]+\s*[kmb]?)\s+were here\b/i);

  const creationMatch = bodyText.match(/(?:created|page created|creation date)\s+([A-Z][a-z]+ \d{1,2}, \d{4})/i);
  page.pageCreationDate = page.pageCreationDate ?? cleanText(creationMatch?.[1]);
  const adStatus = bodyText.match(
    /(This Page is (?:not currently |currently )?running ads\.?)/i,
  );
  page.adStatus = page.adStatus ?? cleanText(adStatus?.[1]);
  if (page.isRunningAds === null && page.adStatus) {
    page.isRunningAds = !/not currently/i.test(page.adStatus);
  }

  mergeRating(page, bodyText);

  $("a[href]").each((_, element) => {
    const href = absoluteAttribute($(element).attr("href"), finalUrl);
    if (!href) return;
    if (/messenger\.com|\/messages\//i.test(href)) {
      page.messengerUrl = page.messengerUrl ?? href;
      return;
    }
    addExternalUrl(page.websites, href, finalUrl);
  });

  $("img").each((_, element) => {
    const imageUrl =
      absoluteAttribute($(element).attr("src"), finalUrl) ??
      absoluteAttribute($(element).attr("data-src"), finalUrl);
    if (!imageUrl) return;
    const descriptor = [
      $(element).attr("alt"),
      $(element).attr("class"),
      $(element).attr("id"),
      $(element).attr("aria-label"),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (!page.profileImageUrl && /(profile|avatar|photo)/.test(descriptor)) {
      page.profileImageUrl = imageUrl;
    }
    if (!page.coverImageUrl && /(cover|banner)/.test(descriptor)) {
      page.coverImageUrl = imageUrl;
    }
  });

  if (!page.aboutText) {
    const introHeading = $("div, span, p")
      .filter((_, element) => /^(intro|about)$/i.test(cleanText($(element).text()) ?? ""))
      .first();
    const sibling = cleanText(introHeading.next().text());
    page.aboutText = sibling && sibling.length > 20 ? sibling : null;
  }
}

function emptyPage(): FacebookPage {
  return {
    pageId: null,
    username: null,
    title: null,
    canonicalUrl: null,
    categories: [],
    intro: null,
    aboutText: null,
    websites: [],
    websiteUrl: null,
    email: null,
    phone: null,
    address: null,
    messengerUrl: null,
    likeCount: null,
    followerCount: null,
    talkingAboutCount: null,
    checkInCount: null,
    wereHereCount: null,
    ratingText: null,
    ratingValue: null,
    ratingCount: null,
    pageCreationDate: null,
    adStatus: null,
    adLibraryId: null,
    isRunningAds: null,
    profileImageUrl: null,
    coverImageUrl: null,
    externalLinks: [],
  };
}

function parseMaybeJson(raw: string): unknown | null {
  try {
    return JSON.parse(raw);
  } catch {
    const trimmed = raw.trim();
    const first = trimmed.indexOf("{");
    const last = trimmed.lastIndexOf("}");
    if (first === -1 || last <= first) return null;
    try {
      return JSON.parse(trimmed.slice(first, last + 1));
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
    const object = value as Record<string, unknown>;
    return (
      stringValue(readAny(object, ["text", "value", "name", "url", "uri"])) ??
      stringValue(readAny(object, ["display_text", "displayText"]))
    );
  }
  return null;
}

function stringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => stringList(item));
  }
  const text = cleanText(stringValue(value));
  return text ? [text] : [];
}

function firstImageValue(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const image = firstImageValue(item);
      if (image) return image;
    }
  }
  if (value && typeof value === "object") {
    return stringValue(
      readAny(value as Record<string, unknown>, [
        "url",
        "uri",
        "src",
        "image",
        "logo",
        "profile_picture",
      ]),
    );
  }
  return null;
}

function addressFromValue(value: unknown): string | null {
  if (typeof value === "string") return cleanText(value);
  if (!value || typeof value !== "object") return null;
  const object = value as Record<string, unknown>;
  const parts = [
    stringValue(readAny(object, ["streetAddress", "street", "address_line_1"])),
    stringValue(readAny(object, ["addressLocality", "city"])),
    stringValue(readAny(object, ["addressRegion", "state", "region"])),
    stringValue(readAny(object, ["postalCode", "zip"])),
    stringValue(readAny(object, ["addressCountry", "country"])),
  ]
    .map((part) => cleanText(part))
    .filter(Boolean);
  return parts.length ? parts.join(", ") : cleanText(stringValue(readAny(object, ["text", "name"])));
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  if (typeof value === "string") return parseMetricNumber(value);
  if (value && typeof value === "object") {
    return numberValue(readAny(value as Record<string, unknown>, ["count", "value", "text"]));
  }
  return null;
}

function booleanValue(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (/^(true|yes|active|running)$/i.test(value.trim())) return true;
    if (/^(false|no|inactive|not running)$/i.test(value.trim())) return false;
  }
  return null;
}

function parseMetricNumber(value: string): number | null {
  const match = value.match(/([\d,.]+)\s*([kmb])?/i);
  if (!match) return null;
  const raw = Number(match[1].replace(/,/g, ""));
  if (!Number.isFinite(raw)) return null;
  const suffix = match[2]?.toLowerCase();
  const multiplier = suffix === "k" ? 1_000 : suffix === "m" ? 1_000_000 : suffix === "b" ? 1_000_000_000 : 1;
  return Math.round(raw * multiplier);
}

function metricFromText(text: string, pattern: RegExp): number | null {
  const match = text.match(pattern);
  return match ? parseMetricNumber(match[1]) : null;
}

function firstNumericString(value: unknown): string | null {
  const text = stringValue(value);
  if (!text) return null;
  const match = text.match(/\d{4,}/);
  return match?.[0] ?? null;
}

function mergeRating(page: MutablePage, text: string) {
  const cleaned = cleanText(text);
  if (!cleaned) return;
  const recommend = cleaned.match(/(\d{1,3})%\s+recommend\s+\(([\d,]+)\s+reviews?\)/i);
  const stars = cleaned.match(/([0-5](?:\.\d)?)\s*(?:out of 5|stars?)\s*(?:\(([\d,]+)\s+reviews?\))?/i);
  if (recommend) {
    page.ratingText = page.ratingText ?? recommend[0];
    page.ratingValue = page.ratingValue ?? Number(recommend[1]);
    page.ratingCount = page.ratingCount ?? Number(recommend[2].replace(/,/g, ""));
  } else if (stars) {
    page.ratingText = page.ratingText ?? stars[0];
    page.ratingValue = page.ratingValue ?? Number(stars[1]);
    page.ratingCount = page.ratingCount ?? (stars[2] ? Number(stars[2].replace(/,/g, "")) : null);
  }
}

function firstEmail(text: string): string | null {
  return cleanEmail(text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]);
}

function cleanEmail(value: string | null | undefined): string | null {
  const text = cleanText(value);
  return text && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(text) ? text : null;
}

function firstPhone(text: string): string | null {
  const match = text.match(/(?:\+\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?){2,5}\d{2,4}/);
  return cleanText(match?.[0]);
}

function addCategory(categories: string[], value: string | null | undefined) {
  const category = cleanText(value);
  if (category && !/^\d+$/.test(category)) categories.push(category);
}

function addUrl(urls: string[], value: string | null | undefined) {
  const url = normalizeNullableUrl(value);
  if (url) urls.push(url);
}

function addExternalUrl(urls: string[], value: string | null | undefined, baseUrl: string) {
  const url = absoluteAttribute(value, baseUrl);
  if (!url) return;
  const parsed = new URL(url);
  if (isFacebookHost(parsed.hostname) || /(^|\.)messenger\.com$/i.test(parsed.hostname)) return;
  urls.push(url);
}

function dedupeStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => cleanText(value)).filter(Boolean) as string[]));
}

function cleanFacebookTitle(value: string | null | undefined): string | null {
  const text = cleanText(value);
  if (!text) return null;
  return cleanText(
    text
      .replace(/\s*\|\s*Facebook.*$/i, "")
      .replace(/\s*-\s*Facebook.*$/i, "")
      .replace(/\s*\/\s*Facebook.*$/i, ""),
  );
}

function cleanHandle(value: string | null | undefined): string | null {
  const text = cleanText(value);
  if (!text) return null;
  const handle = text.replace(/^@/, "").replace(/^facebook\.com\//i, "");
  return /^[a-zA-Z0-9.]{3,80}$/.test(handle) ? handle : null;
}

function usernameFromUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[0] === "profile.php") return cleanHandle(url.searchParams.get("id"));
    return cleanHandle(parts[0]);
  } catch {
    return null;
  }
}

function normalizeNullableUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return normalizeUrl(value);
  } catch {
    return null;
  }
}

function absoluteAttribute(value: string | null | undefined, baseUrl: string): string | null {
  const text = cleanText(value);
  if (!text || /^(mailto:|tel:|javascript:)/i.test(text)) return null;
  try {
    return new URL(text, baseUrl).toString();
  } catch {
    return null;
  }
}

function normalizeUrl(value: string): string {
  const url = new URL(value);
  url.hash = "";
  return url.toString();
}

function looksLikeUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

function isFacebookHost(hostname: string) {
  return /(^|\.)facebook\.com$/i.test(hostname) || /(^|\.)fb\.com$/i.test(hostname);
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
    text.includes("checkpoint") ||
    text.includes("you must log in") ||
    text.includes("log in to facebook") ||
    text.includes("content isn't available") ||
    text.includes("this page isn't available") ||
    text.includes("temporarily blocked")
  );
}

function errorRecord(
  request: PageRequest,
  error: string,
  statusCode: number | null,
): FacebookPagesError {
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
