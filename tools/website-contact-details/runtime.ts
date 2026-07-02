import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";
import { z } from "zod";

const SITE_INPUT = z.string().trim().min(1).max(2_048);
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

export const WEBSITE_CONTACT_DETAILS_INPUT_SCHEMA = z.object({
  sites: z.array(SITE_INPUT).min(1).max(100),
  maxPagesPerSite: z.number().int().min(1).max(10).default(3),
  includeContactPages: z.boolean().default(true),
  countryCode: COUNTRY_CODE.default("us"),
  languageCode: LANGUAGE_CODE.default("en"),
  strategy: z.enum(["auto", "http", "browser"]).default("auto"),
  timeoutSecs: z.number().int().min(5).max(180).default(45),
});

export const WEBSITE_CONTACT_DETAILS_MCP_INPUT_SCHEMA = {
  sites: z
    .array(SITE_INPUT)
    .min(1)
    .max(100)
    .describe("Website URLs or bare domains to extract public contact details from"),
  maxPagesPerSite: z
    .number()
    .int()
    .min(1)
    .max(10)
    .optional()
    .describe("Maximum pages fetched per site after contact-page discovery (default 3)"),
  includeContactPages: z
    .boolean()
    .optional()
    .describe("Discover and fetch likely contact/about/team pages on the same origin (default true)"),
  countryCode: COUNTRY_CODE.optional().describe("Two-letter country code (default us)"),
  languageCode: LANGUAGE_CODE.optional().describe("Language code like en or en-US (default en)"),
  strategy: z
    .enum(["auto", "http", "browser"])
    .optional()
    .describe("Better Fetch strategy for each page (default auto)"),
  timeoutSecs: z
    .number()
    .int()
    .min(5)
    .max(180)
    .optional()
    .describe("Per-page timeout in seconds (default 45)"),
};

export type WebsiteContactDetailsInput = z.input<
  typeof WEBSITE_CONTACT_DETAILS_INPUT_SCHEMA
>;
export type WebsiteContactDetailsOptions = z.output<
  typeof WEBSITE_CONTACT_DETAILS_INPUT_SCHEMA
>;

export type WebsiteContactDetailsFetchRequest = {
  url: string;
  timeoutSecs: number;
  strategy: "auto" | "http" | "browser";
  countryCode: string;
  languageCode: string;
};

export type WebsiteContactDetailsFetchResult = {
  ok?: boolean;
  error?: string;
  message?: string;
  status?: number;
  final_url?: string;
  html?: string | null;
  body_text?: string | null;
  title?: string | null;
};

export type WebsiteContactDetailsFetch = (
  request: WebsiteContactDetailsFetchRequest,
) => Promise<WebsiteContactDetailsFetchResult>;

export type ContactSignal = {
  value: string;
  pageUrl: string;
};

export type SocialProfileSignal = {
  platform: string;
  url: string;
  handle: string | null;
  pageUrl: string;
};

export type ContactFormSignal = {
  pageUrl: string;
  actionUrl: string | null;
  method: string | null;
  fieldNames: string[];
};

export type AddressSignal = {
  value: string;
  pageUrl: string;
};

export type ContactPageOutcome = {
  url: string;
  finalUrl: string | null;
  title: string | null;
  statusCode: number | null;
  ok: boolean;
  error: string | null;
  emailCount: number;
  phoneCount: number;
  socialProfileCount: number;
  contactFormCount: number;
};

export type WebsiteContactDetailsRecord = {
  site: {
    input: string;
    inputIndex: number;
    url: string;
    finalUrl: string;
    domain: string;
  };
  companyName: string | null;
  emails: ContactSignal[];
  phones: ContactSignal[];
  socialProfiles: SocialProfileSignal[];
  contactForms: ContactFormSignal[];
  addresses: AddressSignal[];
  discoveredContactPages: string[];
  pages: ContactPageOutcome[];
};

export type WebsiteContactDetailsError = {
  input: string;
  inputIndex: number;
  url: string | null;
  error: string;
  statusCode: number | null;
};

type SiteRequest = {
  input: string;
  inputIndex: number;
  url: string;
};

type PageExtract = {
  url: string;
  finalUrl: string;
  title: string | null;
  html: string;
  text: string;
  emails: ContactSignal[];
  phones: ContactSignal[];
  socialProfiles: SocialProfileSignal[];
  contactForms: ContactFormSignal[];
  addresses: AddressSignal[];
  discoveredLinks: string[];
  companyName: string | null;
  outcome: ContactPageOutcome;
};

const CONTACT_PATH_RE =
  /(^|[\s/-])(contact|contacts|about|team|people|staff|support|help|impressum|legal|careers|company)([\s/-]|$)/i;

const SOCIAL_HOSTS: Array<{ platform: string; pattern: RegExp }> = [
  { platform: "linkedin", pattern: /(^|\.)linkedin\.com$/i },
  { platform: "x", pattern: /(^|\.)x\.com$/i },
  { platform: "twitter", pattern: /(^|\.)twitter\.com$/i },
  { platform: "facebook", pattern: /(^|\.)facebook\.com$/i },
  { platform: "instagram", pattern: /(^|\.)instagram\.com$/i },
  { platform: "youtube", pattern: /(^|\.)youtube\.com$|(^|\.)youtu\.be$/i },
  { platform: "tiktok", pattern: /(^|\.)tiktok\.com$/i },
  { platform: "pinterest", pattern: /(^|\.)pinterest\.com$/i },
  { platform: "threads", pattern: /(^|\.)threads\.net$/i },
  { platform: "snapchat", pattern: /(^|\.)snapchat\.com$/i },
  { platform: "discord", pattern: /(^|\.)discord\.gg$|(^|\.)discord\.com$/i },
  { platform: "telegram", pattern: /(^|\.)t\.me$|(^|\.)telegram\.me$/i },
  { platform: "whatsapp", pattern: /(^|\.)wa\.me$|(^|\.)whatsapp\.com$/i },
  { platform: "reddit", pattern: /(^|\.)reddit\.com$/i },
  { platform: "github", pattern: /(^|\.)github\.com$/i },
];

export async function extractWebsiteContactDetails(
  input: WebsiteContactDetailsInput,
  fetchPage: WebsiteContactDetailsFetch,
) {
  const options = WEBSITE_CONTACT_DETAILS_INPUT_SCHEMA.parse(input);
  const results: WebsiteContactDetailsRecord[] = [];
  const errors: WebsiteContactDetailsError[] = [];

  for (const [index, site] of options.sites.entries()) {
    let request: SiteRequest;
    try {
      request = buildSiteRequest(site, index + 1);
    } catch (error) {
      errors.push({
        input: site,
        inputIndex: index + 1,
        url: null,
        error: errorMessage(error),
        statusCode: null,
      });
      continue;
    }

    const siteResult = await extractSite(request, options, fetchPage);
    if (siteResult.record) results.push(siteResult.record);
    errors.push(...siteResult.errors);
  }

  const emailCount = results.reduce((total, result) => total + result.emails.length, 0);
  const phoneCount = results.reduce((total, result) => total + result.phones.length, 0);
  const socialProfileCount = results.reduce(
    (total, result) => total + result.socialProfiles.length,
    0,
  );
  const contactFormCount = results.reduce(
    (total, result) => total + result.contactForms.length,
    0,
  );

  return {
    ok: errors.length === 0,
    tool: "website_contact_details",
    site_count: results.length,
    page_count: results.reduce((total, result) => total + result.pages.length, 0),
    email_count: emailCount,
    phone_count: phoneCount,
    social_profile_count: socialProfileCount,
    contact_form_count: contactFormCount,
    item_count: emailCount + phoneCount + socialProfileCount + contactFormCount,
    results,
    errors,
  };
}

async function extractSite(
  request: SiteRequest,
  options: WebsiteContactDetailsOptions,
  fetchPage: WebsiteContactDetailsFetch,
): Promise<{
  record: WebsiteContactDetailsRecord | null;
  errors: WebsiteContactDetailsError[];
}> {
  const errors: WebsiteContactDetailsError[] = [];
  const extracts: PageExtract[] = [];
  const queue = [request.url];
  const visited = new Set<string>();
  const discovered = new Set<string>();

  while (queue.length > 0 && extracts.length < options.maxPagesPerSite) {
    const url = queue.shift()!;
    const normalized = normalizeUrl(url);
    if (visited.has(normalized)) continue;
    visited.add(normalized);

    let response: WebsiteContactDetailsFetchResult;
    try {
      response = await fetchPage({
        url: normalized,
        timeoutSecs: options.timeoutSecs,
        strategy: options.strategy,
        countryCode: options.countryCode,
        languageCode: options.languageCode,
      });
    } catch (error) {
      errors.push(errorRecord(request, normalized, errorMessage(error), null));
      continue;
    }

    if (response.ok === false) {
      errors.push(
        errorRecord(
          request,
          normalized,
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
          normalized,
          "website page appears blocked, unavailable, or login-gated",
          response.status ?? null,
        ),
      );
      continue;
    }

    const finalUrl = normalizeUrl(response.final_url ?? normalized);
    const extract = extractFromHtml(html, finalUrl, response.status ?? null);
    extracts.push(extract);

    if (options.includeContactPages && extracts.length < options.maxPagesPerSite) {
      for (const link of extract.discoveredLinks) {
        if (visited.has(link) || queue.includes(link)) continue;
        discovered.add(link);
        queue.push(link);
        if (queue.length + extracts.length >= options.maxPagesPerSite) break;
      }
    }
  }

  if (extracts.length === 0) {
    if (errors.length === 0) {
      errors.push(errorRecord(request, request.url, "site did not contain contact data", null));
    }
    return { record: null, errors };
  }

  const emails = dedupeSignals(extracts.flatMap((extract) => extract.emails));
  const phones = dedupeSignals(extracts.flatMap((extract) => extract.phones));
  const socialProfiles = dedupeSocialProfiles(
    extracts.flatMap((extract) => extract.socialProfiles),
  );
  const contactForms = dedupeContactForms(
    extracts.flatMap((extract) => extract.contactForms),
  );
  const addresses = dedupeSignals(extracts.flatMap((extract) => extract.addresses));
  const firstFinalUrl = extracts[0].finalUrl;

  if (
    emails.length === 0 &&
    phones.length === 0 &&
    socialProfiles.length === 0 &&
    contactForms.length === 0 &&
    addresses.length === 0
  ) {
    errors.push(errorRecord(request, request.url, "site did not contain contact data", null));
  }

  return {
    record: {
      site: {
        input: request.input,
        inputIndex: request.inputIndex,
        url: request.url,
        finalUrl: firstFinalUrl,
        domain: new URL(firstFinalUrl).hostname.replace(/^www\./i, ""),
      },
      companyName: firstNonEmpty(...extracts.map((extract) => extract.companyName)),
      emails,
      phones,
      socialProfiles,
      contactForms,
      addresses,
      discoveredContactPages: Array.from(discovered),
      pages: extracts.map((extract) => extract.outcome),
    },
    errors,
  };
}

function buildSiteRequest(site: string, inputIndex: number): SiteRequest {
  const raw = site.trim();
  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error("Input must be a website URL or domain");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Only HTTP and HTTPS websites can be processed");
  }
  parsed.hash = "";
  return {
    input: raw,
    inputIndex,
    url: normalizeUrl(parsed.toString()),
  };
}

function extractFromHtml(
  html: string,
  finalUrl: string,
  statusCode: number | null,
): PageExtract {
  const $ = cheerio.load(html || "<html><body></body></html>");
  const text = decodeObfuscatedContacts(cleanText($("body").text()) ?? "");
  const emails = extractEmails($, text, finalUrl);
  const phones = extractPhones($, text, finalUrl);
  const socialProfiles = extractSocialProfiles($, finalUrl);
  const contactForms = extractContactForms($, finalUrl);
  const addresses = extractAddresses($, text, finalUrl);
  const discoveredLinks = extractContactLinks($, finalUrl);
  const title =
    cleanText(
      firstNonEmpty(
        $("meta[property='og:title']").attr("content"),
        $("meta[name='twitter:title']").attr("content"),
        $("title").first().text(),
      ),
    ) ?? null;
  const companyName = cleanCompanyName(
    firstNonEmpty(
      $("meta[property='og:site_name']").attr("content"),
      schemaName($),
      title,
    ),
  );

  return {
    url: finalUrl,
    finalUrl,
    title,
    html,
    text,
    emails,
    phones,
    socialProfiles,
    contactForms,
    addresses,
    discoveredLinks,
    companyName,
    outcome: {
      url: finalUrl,
      finalUrl,
      title,
      statusCode,
      ok: true,
      error: null,
      emailCount: emails.length,
      phoneCount: phones.length,
      socialProfileCount: socialProfiles.length,
      contactFormCount: contactForms.length,
    },
  };
}

function extractEmails($: CheerioAPI, text: string, pageUrl: string): ContactSignal[] {
  const emails: ContactSignal[] = [];
  $("a[href^='mailto:']").each((_, element) => {
    const href = $(element).attr("href") ?? "";
    const value = decodeURIComponent(href.replace(/^mailto:/i, "").split("?")[0]);
    addEmail(emails, value, pageUrl);
  });

  for (const match of text.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)) {
    addEmail(emails, match[0], pageUrl);
  }
  return dedupeSignals(emails);
}

function addEmail(emails: ContactSignal[], value: string, pageUrl: string) {
  const email = cleanText(value)?.toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return;
  if (/\.(png|jpe?g|gif|webp|svg|css|js)$/i.test(email)) return;
  emails.push({ value: email, pageUrl });
}

function extractPhones($: CheerioAPI, text: string, pageUrl: string): ContactSignal[] {
  const phones: ContactSignal[] = [];
  $("a[href^='tel:']").each((_, element) => {
    addPhone(phones, decodeURIComponent(($(element).attr("href") ?? "").replace(/^tel:/i, "")), pageUrl);
  });

  for (const match of text.matchAll(/(?:\+\d{1,3}[\s().-]?)?(?:\(?\d{2,4}\)?[\s().-]?){2,5}\d{2,4}/g)) {
    addPhone(phones, match[0], pageUrl);
  }
  return dedupeSignals(phones);
}

function addPhone(phones: ContactSignal[], value: string, pageUrl: string) {
  const phone = cleanText(value);
  if (!phone) return;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 18) return;
  if (/^(19|20)\d{2}$/.test(digits)) return;
  phones.push({ value: phone, pageUrl });
}

function extractSocialProfiles($: CheerioAPI, pageUrl: string): SocialProfileSignal[] {
  const profiles: SocialProfileSignal[] = [];
  $("a[href]").each((_, element) => {
    const href = absoluteUrl($(element).attr("href"), pageUrl);
    if (!href) return;
    const profile = socialProfileFromUrl(href, pageUrl);
    if (profile) profiles.push(profile);
  });
  return dedupeSocialProfiles(profiles);
}

function socialProfileFromUrl(
  value: string,
  pageUrl: string,
): SocialProfileSignal | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const match = SOCIAL_HOSTS.find((host) => host.pattern.test(url.hostname));
  if (!match) return null;
  if (/\/(share|intent|plugins|tr|privacy|policies)(\/|$)/i.test(url.pathname)) return null;
  return {
    platform: match.platform,
    url: normalizeUrl(url.toString()),
    handle: handleFromSocialUrl(url, match.platform),
    pageUrl,
  };
}

function handleFromSocialUrl(url: URL, platform: string): string | null {
  if (platform === "whatsapp") return url.searchParams.get("phone") ?? firstPathSegment(url);
  if (platform === "youtube" && url.pathname.startsWith("/channel/")) {
    return firstPathSegment(url, 2);
  }
  const first = firstPathSegment(url);
  if (!first) return null;
  return first.replace(/^@/, "") || null;
}

function firstPathSegment(url: URL, index = 1): string | null {
  const parts = url.pathname.split("/").filter(Boolean);
  return parts[index - 1] ? decodeURIComponent(parts[index - 1]) : null;
}

function extractContactForms($: CheerioAPI, pageUrl: string): ContactFormSignal[] {
  const forms: ContactFormSignal[] = [];
  $("form").each((_, element) => {
    const form = $(element);
    const text = cleanText(form.text()) ?? "";
    const actionUrl = absoluteUrl(form.attr("action"), pageUrl);
    const fieldNames = form
      .find("input[name], textarea[name], select[name]")
      .map((_, field) => cleanText($(field).attr("name")))
      .get()
      .filter(Boolean) as string[];
    const descriptor = [text, actionUrl, fieldNames.join(" ")].join(" ").toLowerCase();
    if (!/(contact|message|email|phone|name|inquiry|enquiry|support)/.test(descriptor)) {
      return;
    }
    forms.push({
      pageUrl: pageUrl,
      actionUrl,
      method: cleanText(form.attr("method"))?.toUpperCase() ?? "GET",
      fieldNames: Array.from(new Set(fieldNames)),
    });
  });
  return dedupeContactForms(forms);
}

function extractAddresses(
  $: CheerioAPI,
  text: string,
  pageUrl: string,
): AddressSignal[] {
  const addresses: AddressSignal[] = [];
  for (const value of schemaAddresses($)) {
    addAddress(addresses, value, pageUrl);
  }
  $("address").each((_, element) => addAddress(addresses, $(element).text(), pageUrl));
  if (addresses.length > 0) return dedupeSignals(addresses);

  const line = text.match(
    /\b\d{1,6}\s+[A-Z][A-Za-z0-9.' -]+(?:Street|St|Road|Rd|Avenue|Ave|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Place|Pl|Court|Ct)\b[^.|\n]{0,120}/,
  );
  if (line) addAddress(addresses, line[0], pageUrl);
  return dedupeSignals(addresses);
}

function addAddress(addresses: AddressSignal[], value: string | null | undefined, pageUrl: string) {
  const address = cleanText(value);
  if (!address || address.length < 10) return;
  addresses.push({ value: address, pageUrl });
}

function extractContactLinks($: CheerioAPI, pageUrl: string): string[] {
  const origin = new URL(pageUrl).origin;
  const links: string[] = [];
  $("a[href]").each((_, element) => {
    const href = absoluteUrl($(element).attr("href"), pageUrl);
    if (!href) return;
    const parsed = new URL(href);
    if (parsed.origin !== origin) return;
    parsed.hash = "";
    const text = cleanText($(element).text()) ?? "";
    const haystack = `${parsed.pathname} ${text}`.toLowerCase();
    if (!CONTACT_PATH_RE.test(haystack)) return;
    links.push(normalizeUrl(parsed.toString()));
  });
  return Array.from(new Set(links));
}

function schemaName($: CheerioAPI): string | null {
  for (const object of schemaObjects($)) {
    const type = stringList(readValue(object, "@type")).join(" ").toLowerCase();
    if (type && !/(organization|localbusiness|corporation|person|webpage|website)/.test(type)) {
      continue;
    }
    const name = cleanText(stringValue(readValue(object, "name")));
    if (name) return name;
  }
  return null;
}

function schemaAddresses($: CheerioAPI): string[] {
  const values: string[] = [];
  for (const object of schemaObjects($)) {
    const address = readValue(object, "address");
    const parsed = addressFromValue(address);
    if (parsed) values.push(parsed);
  }
  return values;
}

function schemaObjects($: CheerioAPI): Record<string, unknown>[] {
  const objects: Record<string, unknown>[] = [];
  $("script[type='application/ld+json']").each((_, element) => {
    const raw = $(element).text();
    if (!raw.trim()) return;
    try {
      objects.push(...collectObjects(JSON.parse(raw)));
    } catch {
      // Ignore malformed structured data; visible extraction remains useful.
    }
  });
  return objects;
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
    return stringValue(readValue(object, "text")) ?? stringValue(readValue(object, "name"));
  }
  return null;
}

function stringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap((item) => stringList(item));
  const text = cleanText(stringValue(value));
  return text ? [text] : [];
}

function addressFromValue(value: unknown): string | null {
  if (typeof value === "string") return cleanText(value);
  if (!value || typeof value !== "object") return null;
  const object = value as Record<string, unknown>;
  const parts = [
    stringValue(readValue(object, "streetAddress")),
    stringValue(readValue(object, "addressLocality")),
    stringValue(readValue(object, "addressRegion")),
    stringValue(readValue(object, "postalCode")),
    stringValue(readValue(object, "addressCountry")),
  ]
    .map((part) => cleanText(part))
    .filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

function decodeObfuscatedContacts(value: string): string {
  return value
    .replace(/\s*(?:\[|\()?at(?:\]|\))?\s*/gi, "@")
    .replace(/\s*(?:\[|\()?dot(?:\]|\))?\s*/gi, ".")
    .replace(/\s+@\s+/g, "@")
    .replace(/\s+\.\s+/g, ".");
}

function cleanCompanyName(value: string | null | undefined): string | null {
  const text = cleanText(value);
  if (!text) return null;
  return cleanText(text.replace(/\s*[-|]\s*(Home|Official Site|Website).*$/i, ""));
}

function dedupeSignals<T extends ContactSignal | AddressSignal>(signals: T[]): T[] {
  const seen = new Set<string>();
  const output: T[] = [];
  for (const signal of signals) {
    const key = signal.value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(signal);
  }
  return output;
}

function dedupeSocialProfiles(profiles: SocialProfileSignal[]): SocialProfileSignal[] {
  const seen = new Set<string>();
  const output: SocialProfileSignal[] = [];
  for (const profile of profiles) {
    const key = `${profile.platform}:${profile.url.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(profile);
  }
  return output;
}

function dedupeContactForms(forms: ContactFormSignal[]): ContactFormSignal[] {
  const seen = new Set<string>();
  const output: ContactFormSignal[] = [];
  for (const form of forms) {
    const key = `${form.pageUrl}:${form.actionUrl ?? ""}:${form.fieldNames.join(",")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(form);
  }
  return output;
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

function normalizeUrl(value: string): string {
  const url = new URL(value);
  url.hash = "";
  return url.toString();
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
    text.includes("checking your browser") ||
    text.includes("enable javascript and cookies")
  );
}

function errorRecord(
  request: SiteRequest,
  url: string | null,
  error: string,
  statusCode: number | null,
): WebsiteContactDetailsError {
  return {
    input: request.input,
    inputIndex: request.inputIndex,
    url,
    error,
    statusCode,
  };
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
