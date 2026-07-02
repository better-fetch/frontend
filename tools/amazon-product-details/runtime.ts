import * as cheerio from "cheerio";
import { z } from "zod";

const PRODUCT_INPUT = z.string().trim().min(1).max(2_048);
const AMAZON_DOMAIN = z
  .string()
  .trim()
  .regex(/^amazon\.[a-z.]{2,}$/i, "Use an Amazon domain like amazon.com or amazon.co.uk")
  .transform((value) => value.toLowerCase());
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

export const AMAZON_PRODUCT_DETAILS_INPUT_SCHEMA = z.object({
  products: z.array(PRODUCT_INPUT).min(1).max(100),
  amazonDomain: AMAZON_DOMAIN.default("amazon.com"),
  countryCode: COUNTRY_CODE.default("us"),
  languageCode: LANGUAGE_CODE.default("en"),
  strategy: z.enum(["auto", "http", "browser"]).default("browser"),
  timeoutSecs: z.number().int().min(5).max(180).default(60),
});

export const AMAZON_PRODUCT_DETAILS_MCP_INPUT_SCHEMA = {
  products: z
    .array(PRODUCT_INPUT)
    .min(1)
    .max(100)
    .describe("Amazon product URLs or 10-character ASINs"),
  amazonDomain: AMAZON_DOMAIN.optional().describe("Amazon domain for ASIN inputs (default amazon.com)"),
  countryCode: COUNTRY_CODE.optional().describe("Two-letter country code (default us)"),
  languageCode: LANGUAGE_CODE.optional().describe("Language code like en or en-US (default en)"),
  strategy: z
    .enum(["auto", "http", "browser"])
    .optional()
    .describe("Better Fetch strategy for each product page (default browser)"),
  timeoutSecs: z
    .number()
    .int()
    .min(5)
    .max(180)
    .optional()
    .describe("Per-product timeout in seconds (default 60)"),
};

export type AmazonProductDetailsInput = z.input<typeof AMAZON_PRODUCT_DETAILS_INPUT_SCHEMA>;
export type AmazonProductDetailsOptions = z.output<typeof AMAZON_PRODUCT_DETAILS_INPUT_SCHEMA>;

export type AmazonProductDetailsFetchRequest = {
  url: string;
  timeoutSecs: number;
  strategy: "auto" | "http" | "browser";
  countryCode: string;
  languageCode: string;
};

export type AmazonProductDetailsFetchResult = {
  ok?: boolean;
  error?: string;
  message?: string;
  status?: number;
  final_url?: string;
  html?: string | null;
  body_text?: string | null;
  title?: string | null;
};

export type AmazonProductDetailsFetch = (
  request: AmazonProductDetailsFetchRequest,
) => Promise<AmazonProductDetailsFetchResult>;

export type AmazonProductDetails = {
  asin: string | null;
  title: string;
  brand: string | null;
  priceText: string | null;
  price: number | null;
  currency: string | null;
  listPriceText: string | null;
  listPrice: number | null;
  availability: string | null;
  rating: number | null;
  reviewCount: number | null;
  seller: string | null;
  description: string | null;
  bulletPoints: string[];
  categories: string[];
  mainImage: string | null;
  images: string[];
  specifications: Record<string, string>;
  canonicalUrl: string | null;
  productUrl: string;
};

export type AmazonProductDetailsRecord = {
  input: string;
  inputIndex: number;
  url: string;
  finalUrl: string;
  statusCode: number | null;
  product: AmazonProductDetails;
};

export type AmazonProductDetailsError = {
  input: string;
  inputIndex: number;
  url: string | null;
  error: string;
  statusCode: number | null;
};

type ProductRequest = {
  source: string;
  inputIndex: number;
  url: string;
};

type PriceValue = {
  priceText: string | null;
  price: number | null;
  currency: string | null;
};

export async function scrapeAmazonProductDetails(
  input: AmazonProductDetailsInput,
  fetchProductPage: AmazonProductDetailsFetch,
) {
  const options = AMAZON_PRODUCT_DETAILS_INPUT_SCHEMA.parse(input);
  const results: AmazonProductDetailsRecord[] = [];
  const errors: AmazonProductDetailsError[] = [];

  for (const [index, source] of options.products.entries()) {
    let request: ProductRequest;
    try {
      request = buildProductRequest(source, index + 1, options);
    } catch (error) {
      errors.push({
        input: source,
        inputIndex: index + 1,
        url: null,
        error: errorMessage(error),
        statusCode: null,
      });
      continue;
    }

    let response: AmazonProductDetailsFetchResult;
    try {
      response = await fetchProductPage({
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
      errors.push(errorRecord(request, "amazon page appears blocked", response.status ?? null));
      continue;
    }

    const finalUrl = normalizeUrl(response.final_url ?? request.url);
    const product = parseAmazonProduct(html, finalUrl);
    if (!product) {
      errors.push(
        errorRecord(
          request,
          "product page did not contain product details",
          response.status ?? null,
        ),
      );
      continue;
    }

    results.push({
      input: request.source,
      inputIndex: request.inputIndex,
      url: request.url,
      finalUrl,
      statusCode: response.status ?? null,
      product,
    });
  }

  return {
    ok: errors.length === 0,
    actor: "amazon_product_details",
    product_count: results.length,
    item_count: results.length,
    results,
    errors,
  };
}

function buildProductRequest(
  source: string,
  inputIndex: number,
  options: AmazonProductDetailsOptions,
): ProductRequest {
  const raw = source.trim();
  const inputUrl = parseInputUrl(raw);
  if (inputUrl && !isAmazonUrl(inputUrl)) {
    throw new Error("URL input must be an Amazon product URL");
  }

  if (inputUrl) {
    inputUrl.hash = "";
    inputUrl.searchParams.set("language", languageParam(options.languageCode));
    return { source: raw, inputIndex, url: inputUrl.href };
  }

  if (!/^[A-Z0-9]{10}$/i.test(raw)) {
    throw new Error("Input must be an Amazon product URL or 10-character ASIN");
  }

  const url = new URL(`https://www.${options.amazonDomain}/dp/${raw.toUpperCase()}`);
  url.searchParams.set("language", languageParam(options.languageCode));
  return { source: raw, inputIndex, url: url.href };
}

function parseAmazonProduct(html: string, pageUrl: string): AmazonProductDetails | null {
  const $ = cheerio.load(html);
  const jsonLd = productJsonLd($);
  const title =
    firstText($, "#productTitle") ??
    stringValue(jsonLd?.name) ??
    attr($, "meta[property='og:title']", "content") ??
    "";

  const asin =
    asinFromUrl(pageUrl) ??
    attr($, "input[name='ASIN']", "value") ??
    attr($, "[data-asin]", "data-asin") ??
    attr($, "#ASIN", "value") ??
    stringValue(jsonLd?.sku) ??
    stringValue(jsonLd?.productID);

  if (!title && !asin) return null;

  const offer = firstOffer(jsonLd);
  const domPrice = priceFromDom($);
  const price = domPrice.priceText ? domPrice : priceFromJsonLd(offer) ?? domPrice;
  const listPrice = priceFromText(
    firstText($, ".basisPrice .a-offscreen") ??
      firstText($, ".priceBlockStrikePriceString") ??
      firstText($, ".a-text-price .a-offscreen") ??
      "",
    price.currency,
  );
  const canonicalUrl =
    attr($, "link[rel='canonical']", "href") ??
    attr($, "meta[property='og:url']", "content") ??
    null;
  const jsonLdImages = Array.isArray(jsonLd?.image) ? jsonLd.image.filter(isString) : [];
  const images = unique([
    ...dynamicImageUrls($),
    attr($, "#landingImage", "data-old-hires"),
    attr($, "#landingImage", "src"),
    attr($, "meta[property='og:image']", "content"),
    stringValue(jsonLd?.image),
    ...jsonLdImages,
  ].map((url) => normalizeExternalUrl(url, pageUrl)).filter(isString));
  const specifications = extractSpecifications($);

  return {
    asin,
    title: cleanTitle(title),
    brand: normalizeBrand(
      firstText($, ".po-brand .po-break-word") ??
        firstText($, "#bylineInfo") ??
        brandFromJsonLd(jsonLd) ??
        specifications.Brand ??
        null,
    ),
    priceText: price.priceText,
    price: price.price,
    currency: price.currency,
    listPriceText: listPrice.priceText,
    listPrice: listPrice.price,
    availability:
      firstText($, "#availability") ??
      stringValue(offer?.availability)?.split("/").at(-1) ??
      null,
    rating:
      parseRating(
        attr($, "#acrPopover", "title") ??
          attr($, ".reviewCountTextLinkedHistogram", "title") ??
          firstText($, "i.a-icon-star span.a-icon-alt") ??
          String(jsonLd?.aggregateRating && isRecord(jsonLd.aggregateRating)
            ? jsonLd.aggregateRating.ratingValue ?? ""
            : ""),
      ),
    reviewCount:
      parseReviewCount(firstText($, "#acrCustomerReviewText") ?? "") ??
      (jsonLd?.aggregateRating && isRecord(jsonLd.aggregateRating)
        ? parseReviewCount(String(jsonLd.aggregateRating.reviewCount ?? ""))
        : null),
    seller:
      firstText($, "#sellerProfileTriggerId") ??
      cleanSeller(firstText($, "#merchant-info")) ??
      null,
    description:
      firstText($, "#productDescription") ??
      attr($, "meta[name='description']", "content") ??
      stringValue(jsonLd?.description),
    bulletPoints: extractBullets($),
    categories: extractCategories($),
    mainImage: images[0] ?? null,
    images,
    specifications,
    canonicalUrl: canonicalUrl ? normalizeExternalUrl(canonicalUrl, pageUrl) : null,
    productUrl: normalizeExternalUrl(canonicalUrl, pageUrl) ?? pageUrl,
  };
}

function productJsonLd($: cheerio.CheerioAPI): Record<string, unknown> | null {
  for (const element of $("script[type='application/ld+json']").toArray()) {
    let parsed: unknown;
    try {
      parsed = JSON.parse($(element).text());
    } catch {
      continue;
    }
    const product = flattenJsonLd(parsed).find((item) => {
      if (!isRecord(item)) return false;
      const type = item["@type"];
      const typeValues = Array.isArray(type) ? type : [type];
      return typeValues.some((value) => typeof value === "string" && /product/i.test(value));
    });
    if (isRecord(product)) return product;
  }
  return null;
}

function firstOffer(value: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!value) return null;
  const offers = value.offers;
  if (Array.isArray(offers)) {
    return offers.find(isRecord) ?? null;
  }
  return isRecord(offers) ? offers : null;
}

function priceFromJsonLd(offer: Record<string, unknown> | null): PriceValue | null {
  if (!offer) return null;
  const rawPrice = stringValue(offer.price) ?? numberString(offer.price);
  if (!rawPrice) return null;
  const currency = stringValue(offer.priceCurrency);
  return priceFromText(`${currency ?? ""} ${rawPrice}`.trim(), currency);
}

function priceFromDom($: cheerio.CheerioAPI): PriceValue {
  return priceFromText(
    firstText($, "#corePrice_feature_div .a-price .a-offscreen") ??
      firstText($, ".a-price .a-offscreen") ??
      firstText($, "#priceblock_ourprice") ??
      firstText($, "#priceblock_dealprice") ??
      "",
    null,
  );
}

function priceFromText(value: string, fallbackCurrency: string | null): PriceValue {
  const text = normalizeText(value);
  if (!text) return { priceText: null, price: null, currency: fallbackCurrency };
  const match = text.match(
    /(A\$|C\$|NZ\$|US\$|[$£€¥₹]|USD|EUR|GBP|AUD|CAD|JPY|INR)?\s*([\d,.]+(?:\.\d+)?)/i,
  );
  if (!match) return { priceText: text, price: null, currency: fallbackCurrency };
  const price = Number.parseFloat(match[2].replace(/,/g, ""));
  return {
    priceText: text,
    price: Number.isFinite(price) ? price : null,
    currency: normalizeCurrency(match[1] ?? fallbackCurrency),
  };
}

function extractBullets($: cheerio.CheerioAPI): string[] {
  const bullets = new Set<string>();
  $("#feature-bullets li span.a-list-item, #featurebullets_feature_div li span")
    .each((_, element) => {
      const text = normalizeText($(element).text());
      if (
        text &&
        text.length <= 500 &&
        !/make sure this fits|report an issue|show more|show less/i.test(text)
      ) {
        bullets.add(text);
      }
    });
  return [...bullets];
}

function extractCategories($: cheerio.CheerioAPI): string[] {
  return unique(
    $("#wayfinding-breadcrumbs_feature_div li a, #wayfinding-breadcrumbs_container li a")
      .toArray()
      .map((element) => normalizeText($(element).text()))
      .filter(Boolean),
  );
}

function extractSpecifications($: cheerio.CheerioAPI): Record<string, string> {
  const specs: Record<string, string> = {};
  const addSpec = (key: string, value: string) => {
    const cleanKey = normalizeSpecKey(key);
    const cleanValue = normalizeText(value);
    if (cleanKey && cleanValue && cleanKey.length <= 100 && cleanValue.length <= 500) {
      specs[cleanKey] = cleanValue;
    }
  };

  $(
    "#productDetails_techSpec_section_1 tr, #productDetails_detailBullets_sections1 tr, table.a-keyvalue tr",
  ).each((_, row) => {
    const node = $(row);
    addSpec(node.find("th").first().text(), node.find("td").first().text());
  });

  $("#detailBullets_feature_div li").each((_, element) => {
    const text = normalizeText($(element).text());
    const [key, ...rest] = text.split(":");
    if (rest.length > 0) addSpec(key, rest.join(":"));
  });

  $(".prodDetTable tr").each((_, row) => {
    const node = $(row);
    addSpec(node.find("th").first().text(), node.find("td").first().text());
  });

  return specs;
}

function dynamicImageUrls($: cheerio.CheerioAPI): string[] {
  const value = attr($, "#landingImage", "data-a-dynamic-image");
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return isRecord(parsed) ? Object.keys(parsed) : [];
  } catch {
    return [];
  }
}

function flattenJsonLd(value: unknown): unknown[] {
  if (Array.isArray(value)) return value.flatMap(flattenJsonLd);
  if (!isRecord(value)) return [];
  const graph = value["@graph"];
  return [value, ...(Array.isArray(graph) ? graph.flatMap(flattenJsonLd) : [])];
}

function firstText($: cheerio.CheerioAPI, selector: string): string | null {
  const text = normalizeText($(selector).first().text());
  return text || null;
}

function attr($: cheerio.CheerioAPI, selector: string, name: string): string | null {
  return normalizeText($(selector).first().attr(name) ?? "") || null;
}

function normalizeBrand(value: string | null): string | null {
  if (!value) return null;
  const normalized = value
    .replace(/^visit the\s+/i, "")
    .replace(/\s+store$/i, "")
    .replace(/^brand\s*:\s*/i, "")
    .trim();
  return normalized || null;
}

function brandFromJsonLd(value: Record<string, unknown> | null): string | null {
  if (!value) return null;
  if (typeof value.brand === "string") return value.brand;
  if (isRecord(value.brand)) return stringValue(value.brand.name);
  return null;
}

function cleanTitle(value: string): string {
  return value.replace(/\s*:\s*Amazon\.[a-z.]+.*$/i, "").trim();
}

function cleanSeller(value: string | null): string | null {
  if (!value) return null;
  const seller = value.match(/sold by\s+(.+?)(?:\s+and\s+|$)/i)?.[1] ?? value;
  return normalizeText(seller) || null;
}

function normalizeSpecKey(value: string): string {
  return normalizeText(value)
    .replace(/^[\u200e\u200f\s]+|[\u200e\u200f\s]+$/g, "")
    .replace(/\s+/g, " ");
}

function parseRating(value: string): number | null {
  const match = value.match(/\b([1-5](?:\.\d+)?)\b/);
  if (!match) return null;
  const rating = Number.parseFloat(match[1]);
  return Number.isFinite(rating) ? rating : null;
}

function parseReviewCount(value: string): number | null {
  const match =
    value.match(/\b([\d,]+)\s+(?:ratings?|reviews?)\b/i) ??
    value.match(/^([\d,]+)$/);
  if (!match) return null;
  const count = Number.parseInt(match[1].replace(/,/g, ""), 10);
  return Number.isFinite(count) ? count : null;
}

function asinFromUrl(url: string): string | null {
  const match = url.match(/\/(?:dp|gp\/product|product)\/([A-Z0-9]{10})(?:[/?]|$)/i);
  return match?.[1]?.toUpperCase() ?? null;
}

function normalizeCurrency(value: string | null | undefined): string | null {
  if (!value) return null;
  const currency = value.toUpperCase();
  const currencies: Record<string, string> = {
    "$": "USD",
    "US$": "USD",
    "A$": "AUD",
    "C$": "CAD",
    "NZ$": "NZD",
    "£": "GBP",
    "€": "EUR",
    "¥": "JPY",
    "₹": "INR",
  };
  return currencies[currency] ?? currency;
}

function normalizeExternalUrl(value: string | null | undefined, baseUrl: string): string | null {
  if (!value || value.startsWith("data:")) return null;
  try {
    const url = new URL(value, baseUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.hash = "";
    return url.href;
  } catch {
    return null;
  }
}

function isAmazonUrl(url: URL) {
  const hostname = url.hostname.replace(/^www\./, "").toLowerCase();
  return hostname === "amazon.com" || hostname.startsWith("amazon.") || hostname.includes(".amazon.");
}

function parseInputUrl(value: string): URL | null {
  if (!/^https?:\/\//i.test(value)) return null;
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function languageParam(languageCode: string) {
  const [language, region] = languageCode.split("-");
  return region ? `${language}_${region.toUpperCase()}` : language;
}

function looksBlocked(html: string) {
  return /robot check|enter the characters you see|automated access|not a robot|captcha/i.test(html);
}

function normalizeUrl(url: string) {
  const parsed = new URL(url);
  parsed.hash = "";
  return parsed.href;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberString(value: unknown): string | null {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : null;
}

function isString(value: unknown): value is string {
  return typeof value === "string" && Boolean(value.trim());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function errorRecord(
  request: ProductRequest,
  error: string,
  statusCode: number | null,
): AmazonProductDetailsError {
  return {
    input: request.source,
    inputIndex: request.inputIndex,
    url: request.url,
    error,
    statusCode,
  };
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
