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
const GOOGLE_DOMAIN = z
  .string()
  .trim()
  .regex(/^google\.[a-z.]+$/i, "Use a Google search domain like google.com")
  .transform((value) => value.toLowerCase());

export const GOOGLE_SEARCH_RESULTS_INPUT_SCHEMA = z.object({
  queries: z.array(SEARCH_INPUT).min(1).max(50),
  countryCode: COUNTRY_CODE.default("us"),
  languageCode: LANGUAGE_CODE.default("en"),
  googleDomain: GOOGLE_DOMAIN.default("google.com"),
  maxPagesPerQuery: z.number().int().min(1).max(10).default(1),
  resultsPerPage: z.number().int().min(1).max(100).default(10),
  mobileResults: z.boolean().default(false),
  strategy: z.enum(["auto", "http", "browser"]).default("browser"),
  timeoutSecs: z.number().int().min(5).max(120).default(60),
});

export const GOOGLE_SEARCH_RESULTS_MCP_INPUT_SCHEMA = {
  queries: z
    .array(SEARCH_INPUT)
    .min(1)
    .max(50)
    .describe("Search terms or raw Google search result URLs to fetch"),
  countryCode: COUNTRY_CODE.optional().describe("Two-letter search country code (default us)"),
  languageCode: LANGUAGE_CODE.optional().describe("Search language code like en or en-US (default en)"),
  googleDomain: GOOGLE_DOMAIN.optional().describe("Google search domain to use for keyword input (default google.com)"),
  maxPagesPerQuery: z
    .number()
    .int()
    .min(1)
    .max(10)
    .optional()
    .describe("Number of result pages to fetch per query (default 1, max 10)"),
  resultsPerPage: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe("Requested results per Google page (default 10, max 100)"),
  mobileResults: z
    .boolean()
    .optional()
    .describe("Request mobile-shaped results with a mobile user agent (default false)"),
  strategy: z
    .enum(["auto", "http", "browser"])
    .optional()
    .describe("Better Fetch strategy for each SERP page (default browser)"),
  timeoutSecs: z
    .number()
    .int()
    .min(5)
    .max(120)
    .optional()
    .describe("Per-page timeout in seconds (default 60)"),
};

export type GoogleSearchResultsInput = z.input<
  typeof GOOGLE_SEARCH_RESULTS_INPUT_SCHEMA
>;
export type GoogleSearchResultsOptions = z.output<
  typeof GOOGLE_SEARCH_RESULTS_INPUT_SCHEMA
>;

export type GoogleSearchResultsFetchRequest = {
  url: string;
  timeoutSecs: number;
  strategy: "auto" | "http" | "browser";
  countryCode: string;
  languageCode: string;
  mobileResults: boolean;
};

export type GoogleSearchResultsFetchResult = {
  ok?: boolean;
  error?: string;
  message?: string;
  status?: number;
  final_url?: string;
  html?: string | null;
  body_text?: string | null;
  title?: string | null;
};

export type GoogleSearchResultsFetch = (
  request: GoogleSearchResultsFetchRequest,
) => Promise<GoogleSearchResultsFetchResult>;

export type GoogleSearchQuery = {
  term: string | null;
  url: string;
  device: "DESKTOP" | "MOBILE";
  page: number;
  type: "SEARCH" | "URL";
  domain: string;
  countryCode: string;
  languageCode: string;
};

export type GoogleSearchResultItem = {
  position: number;
  title: string;
  url: string;
  displayedUrl: string | null;
  description: string | null;
};

export type GooglePeopleAlsoAskItem = {
  question: string;
  answer: string | null;
};

export type GoogleRelatedQueryItem = {
  title: string;
  url: string | null;
};

export type GoogleSearchPageRecord = {
  searchQuery: GoogleSearchQuery;
  resultsTotal: string | null;
  organicResults: GoogleSearchResultItem[];
  paidResults: GoogleSearchResultItem[];
  peopleAlsoAsk: GooglePeopleAlsoAskItem[];
  relatedQueries: GoogleRelatedQueryItem[];
};

export type GoogleSearchResultsError = {
  query: string;
  queryIndex: number;
  page: number | null;
  url: string | null;
  error: string;
  statusCode: number | null;
};

type SearchRequest = {
  source: string;
  queryIndex: number;
  term: string | null;
  url: string;
  page: number;
  type: "SEARCH" | "URL";
  domain: string;
};

export async function scrapeGoogleSearchResults(
  input: GoogleSearchResultsInput,
  fetchSearchPage: GoogleSearchResultsFetch,
) {
  const options = GOOGLE_SEARCH_RESULTS_INPUT_SCHEMA.parse(input);
  const records: GoogleSearchPageRecord[] = [];
  const errors: GoogleSearchResultsError[] = [];

  for (const [index, source] of options.queries.entries()) {
    let requests: SearchRequest[];
    try {
      requests = buildSearchRequests(source, index + 1, options);
    } catch (error) {
      errors.push({
        query: source,
        queryIndex: index + 1,
        page: null,
        url: null,
        error: errorMessage(error),
        statusCode: null,
      });
      continue;
    }

    for (const request of requests) {
      let response: GoogleSearchResultsFetchResult;
      try {
        response = await fetchSearchPage({
          url: request.url,
          timeoutSecs: options.timeoutSecs,
          strategy: options.strategy,
          countryCode: options.countryCode,
          languageCode: options.languageCode,
          mobileResults: options.mobileResults,
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
        errors.push(errorRecord(request, "search page appears blocked", response.status ?? null));
        continue;
      }

      records.push(
        parseSearchPage(html, {
          ...request,
          url: normalizeUrl(response.final_url ?? request.url),
          countryCode: options.countryCode.toUpperCase(),
          languageCode: options.languageCode,
          mobileResults: options.mobileResults,
        }),
      );
    }
  }

  const itemCount = records.reduce(
    (total, record) => total + record.organicResults.length + record.paidResults.length,
    0,
  );

  return {
    ok: errors.length === 0,
    actor: "google_search_results",
    page_count: records.length,
    item_count: itemCount,
    results: records,
    errors,
  };
}

function buildSearchRequests(
  source: string,
  queryIndex: number,
  options: GoogleSearchResultsOptions,
): SearchRequest[] {
  const raw = source.trim();
  const inputUrl = parseInputUrl(raw);
  if (inputUrl && !isGoogleSearchUrl(inputUrl)) {
    throw new Error("URL input must be a Google search URL");
  }

  const domain = inputUrl?.hostname.replace(/^www\./, "") ?? options.googleDomain;
  const term = inputUrl?.searchParams.get("q")?.trim() || (inputUrl ? null : raw);
  const baseUrl =
    inputUrl ??
    new URL(`https://${domain.startsWith("www.") ? domain : `www.${domain}`}/search`);

  return Array.from({ length: options.maxPagesPerQuery }, (_, index) => {
    const page = index + 1;
    const url = new URL(baseUrl.href);
    url.pathname = url.pathname || "/search";
    if (term) url.searchParams.set("q", term);
    url.searchParams.set("num", String(options.resultsPerPage));
    url.searchParams.set("hl", options.languageCode);
    url.searchParams.set("gl", options.countryCode);
    if (page === 1) {
      url.searchParams.delete("start");
    } else {
      url.searchParams.set("start", String((page - 1) * options.resultsPerPage));
    }
    url.hash = "";

    return {
      source: raw,
      queryIndex,
      term,
      url: url.href,
      page,
      type: inputUrl ? "URL" : "SEARCH",
      domain,
    };
  });
}

function parseSearchPage(
  html: string,
  request: SearchRequest & {
    countryCode: string;
    languageCode: string;
    mobileResults: boolean;
  },
): GoogleSearchPageRecord {
  const $ = cheerio.load(html);
  const baseUrl = new URL(request.url).origin;
  return {
    searchQuery: {
      term: request.term,
      url: request.url,
      device: request.mobileResults ? "MOBILE" : "DESKTOP",
      page: request.page,
      type: request.type,
      domain: request.domain,
      countryCode: request.countryCode,
      languageCode: request.languageCode,
    },
    resultsTotal: extractResultsTotal($),
    organicResults: extractOrganicResults($, baseUrl),
    paidResults: extractPaidResults($, baseUrl),
    peopleAlsoAsk: extractPeopleAlsoAsk($),
    relatedQueries: extractRelatedQueries($, baseUrl),
  };
}

function extractOrganicResults($: cheerio.CheerioAPI, baseUrl: string) {
  const containers = $("#search .g").toArray();
  const candidates =
    containers.length > 0
      ? containers
      : $("div")
          .toArray()
          .filter((element) => {
            const node = $(element);
            return node.find("h3").length > 0 && node.find("a[href]").length > 0;
          });
  return extractResultItems($, candidates, baseUrl, { skipSponsored: true });
}

function extractPaidResults($: cheerio.CheerioAPI, baseUrl: string) {
  const explicit = $("div[data-text-ad], .uEierd").toArray();
  const candidates =
    explicit.length > 0
      ? explicit
      : $("div")
          .toArray()
          .filter((element) => isSponsored($(element)) && hasHeadingLink($(element)));
  return extractResultItems($, candidates, baseUrl, { requireSponsored: true });
}

function extractResultItems(
  $: cheerio.CheerioAPI,
  candidates: Element[],
  baseUrl: string,
  options: { skipSponsored?: boolean; requireSponsored?: boolean },
): GoogleSearchResultItem[] {
  const seen = new Set<string>();
  const results: GoogleSearchResultItem[] = [];

  for (const element of candidates) {
    const node = $(element);
    const sponsored = isSponsored(node);
    if (options.skipSponsored && sponsored) continue;
    if (options.requireSponsored && !sponsored) continue;

    const heading = node.find("h3, [role='heading']").first();
    const title = normalizeText(heading.text());
    if (!title) continue;

    const linkElement = heading.closest("a[href]").length
      ? heading.closest("a[href]").first()
      : node.find("a[href]").first();
    const url = normalizeGoogleLink(linkElement.attr("href"), baseUrl);
    if (!url || isGoogleInternalUrl(url)) continue;

    const key = `${title}\n${url}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    results.push({
      position: results.length + 1,
      title,
      url,
      displayedUrl: normalizeText(node.find("cite").first().text()) || hostLabel(url),
      description: extractDescription($, node, title),
    });
  }

  return results;
}

function extractPeopleAlsoAsk($: cheerio.CheerioAPI): GooglePeopleAlsoAskItem[] {
  const seen = new Set<string>();
  const items: GooglePeopleAlsoAskItem[] = [];

  $("div[jsname='N760b'], .related-question-pair, div[data-q]").each((_, element) => {
    const node = $(element);
    const question =
      normalizeText(node.attr("data-q") ?? "") ||
      normalizeText(node.find("[role='heading']").first().text()) ||
      firstQuestionText(node.text());
    if (!question || seen.has(question.toLowerCase())) return;
    seen.add(question.toLowerCase());

    const answer =
      normalizeText(node.find(".hgKElc, [data-attrid='wa:/description']").first().text()) ||
      null;
    items.push({ question, answer });
  });

  return items;
}

function extractRelatedQueries($: cheerio.CheerioAPI, baseUrl: string) {
  const seen = new Set<string>();
  const items: GoogleRelatedQueryItem[] = [];
  $("#bres a[href], div[aria-label*='Related'] a[href], a[href*='/search?q=']").each(
    (_, element) => {
      const node = $(element);
      const title = normalizeText(node.find("span").last().text()) || normalizeText(node.text());
      if (!title || title.length > 120) return;
      const url = normalizeGoogleLink(node.attr("href"), baseUrl);
      const key = title.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      items.push({ title, url });
    },
  );
  return items;
}

function extractResultsTotal($: cheerio.CheerioAPI) {
  const explicit = normalizeText($("#result-stats").text());
  if (explicit) return explicit;
  const text = normalizeText($("body").text());
  const match = text.match(/\b(?:About\s+)?[\d,.]+\s+results\b/i);
  return match?.[0] ?? null;
}

function extractDescription(
  $: cheerio.CheerioAPI,
  node: cheerio.Cheerio<Element>,
  title: string,
) {
  for (const selector of [".VwiC3b", ".IsZvec", "[data-sncf]", ".MUxGbd"]) {
    const text = normalizeText(node.find(selector).first().text());
    if (text && text !== title && !/^sponsored$/i.test(text)) return text;
  }

  const clone = node.clone();
  clone.find("h3, [role='heading'], cite, a, script, style").remove();
  const fallback = normalizeText(clone.text().replace(/\bSponsored\b/gi, ""));
  return fallback && fallback !== title ? fallback : null;
}

function hasHeadingLink(node: cheerio.Cheerio<Element>) {
  return node.find("h3, [role='heading']").length > 0 && node.find("a[href]").length > 0;
}

function isSponsored(node: cheerio.Cheerio<Element>) {
  return Boolean(
    node.attr("data-text-ad") ||
      node.hasClass("uEierd") ||
      /\bSponsored\b/i.test(node.text()),
  );
}

function normalizeGoogleLink(value: string | undefined, baseUrl: string): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value, baseUrl);
    const isRedirect =
      isGoogleInternalUrl(parsed.href) &&
      (parsed.pathname === "/url" || parsed.pathname === "/aclk");
    const q = isRedirect
      ? parsed.searchParams.get("q") || parsed.searchParams.get("url")
      : null;
    const target = q ? new URL(q, baseUrl) : parsed;
    if (target.protocol !== "http:" && target.protocol !== "https:") return null;
    target.hash = "";
    return target.href;
  } catch {
    return null;
  }
}

function isGoogleInternalUrl(url: string) {
  const hostname = new URL(url).hostname.replace(/^www\./, "");
  return hostname.startsWith("google.") || hostname.endsWith(".google.com");
}

function isGoogleSearchUrl(url: URL) {
  const hostname = url.hostname.replace(/^www\./, "").toLowerCase();
  return (hostname.startsWith("google.") || hostname.endsWith(".google.com")) &&
    url.pathname.startsWith("/search");
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

function firstQuestionText(text: string) {
  const match = normalizeText(text).match(/([^?.!]*\?)/);
  return match?.[1]?.trim() ?? "";
}

function hostLabel(url: string) {
  return new URL(url).hostname.replace(/^www\./, "");
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
): GoogleSearchResultsError {
  return {
    query: request.source,
    queryIndex: request.queryIndex,
    page: request.page,
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
