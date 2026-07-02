import * as cheerio from "cheerio";
import type { AnyNode, Element } from "domhandler";
import { z } from "zod";

const HTTP_URL = z
  .string()
  .url()
  .refine((value) => {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  }, "Only HTTP and HTTPS feed URLs can be processed");

const OPTIONAL_DATE = z
  .string()
  .trim()
  .min(1)
  .refine((value) => Number.isFinite(Date.parse(value)), "Must be a valid date");

export const RSS_FEED_READER_INPUT_SCHEMA = z.object({
  feedUrls: z.array(HTTP_URL).min(1).max(50),
  publishedAfter: OPTIONAL_DATE.optional(),
  maxItemsPerFeed: z.number().int().min(1).max(500).default(25),
  maxTotalItems: z.number().int().min(1).max(5_000).default(25),
});

export const RSS_FEED_READER_MCP_INPUT_SCHEMA = {
  feedUrls: z
    .array(HTTP_URL)
    .min(1)
    .max(50)
    .describe("One or more public RSS, Atom, RDF, or JSON Feed URLs to parse"),
  publishedAfter: OPTIONAL_DATE.optional().describe(
    "Keep only items published on or after this date when the feed exposes a date; undated items are kept",
  ),
  maxItemsPerFeed: z
    .number()
    .int()
    .min(1)
    .max(500)
    .optional()
    .describe("Maximum accepted items per feed after filtering (default 25)"),
  maxTotalItems: z
    .number()
    .int()
    .min(1)
    .max(5_000)
    .optional()
    .describe("Maximum accepted items across the whole run (default 25)"),
};

export type RssFeedReaderInput = z.input<typeof RSS_FEED_READER_INPUT_SCHEMA>;
export type RssFeedReaderOptions = z.output<typeof RSS_FEED_READER_INPUT_SCHEMA>;

export type RssFeedReaderFetchRequest = {
  url: string;
  timeoutSecs: number;
};

export type RssFeedReaderFetchResult = {
  ok?: boolean;
  error?: string;
  message?: string;
  status?: number;
  final_url?: string;
  body_text?: string | null;
  html?: string | null;
  json?: unknown;
  content_type?: string;
};

export type RssFeedReaderFetch = (
  request: RssFeedReaderFetchRequest,
) => Promise<RssFeedReaderFetchResult>;

export type RssFeedEnclosure = {
  url: string;
  type: string | null;
  length: string | null;
  title: string | null;
};

export type RssFeedItem = {
  feedUrl: string;
  feedIndex: number;
  feedTitle: string | null;
  feedHomeUrl: string | null;
  feedType: "rss" | "atom" | "rdf" | "json";
  itemIndexInFeed: number;
  title: string | null;
  url: string | null;
  guid: string | null;
  itemKey: string;
  publishedAt: string | null;
  updatedAt: string | null;
  authors: string[];
  categories: string[];
  summaryText: string | null;
  summaryHtml: string | null;
  contentText: string | null;
  contentHtml: string | null;
  imageUrl: string | null;
  enclosures: RssFeedEnclosure[];
  rawDateText: string | null;
};

export type RssFeedReaderError = {
  feedUrl: string;
  feedIndex: number;
  error: string;
  statusCode: number | null;
};

export async function readRssFeeds(
  input: RssFeedReaderInput,
  fetchFeed: RssFeedReaderFetch,
) {
  const options = RSS_FEED_READER_INPUT_SCHEMA.parse(input);
  const publishedAfterTime = options.publishedAfter
    ? Date.parse(options.publishedAfter)
    : null;
  const items: RssFeedItem[] = [];
  const errors: RssFeedReaderError[] = [];

  for (const [index, rawFeedUrl] of options.feedUrls.entries()) {
    if (items.length >= options.maxTotalItems) break;

    const feedUrl = normalizeUrl(rawFeedUrl);
    const feedIndex = index + 1;
    let response: RssFeedReaderFetchResult;
    try {
      response = await fetchFeed({ url: feedUrl, timeoutSecs: 30 });
    } catch (error) {
      errors.push({
        feedUrl,
        feedIndex,
        error: errorMessage(error),
        statusCode: null,
      });
      continue;
    }

    if (response.ok === false) {
      errors.push({
        feedUrl,
        feedIndex,
        error: response.error ?? response.message ?? "fetch failed",
        statusCode: response.status ?? null,
      });
      continue;
    }

    const baseUrl = normalizeUrl(response.final_url ?? feedUrl);
    const raw = feedPayloadText(response);
    const parsed = parseFeedPayload(raw, feedUrl, baseUrl, feedIndex);
    if (parsed.kind === "invalid") {
      errors.push({
        feedUrl,
        feedIndex,
        error: parsed.error,
        statusCode: response.status ?? null,
      });
      continue;
    }

    let acceptedForFeed = 0;
    for (const item of parsed.items) {
      if (items.length >= options.maxTotalItems) break;
      if (acceptedForFeed >= options.maxItemsPerFeed) break;
      if (!passesPublishedAfter(item, publishedAfterTime)) continue;
      items.push(item);
      acceptedForFeed += 1;
    }
  }

  return {
    ok: errors.length === 0,
    actor: "rss_feed_reader",
    item_count: items.length,
    items,
    errors,
  };
}

function parseFeedPayload(
  raw: string,
  feedUrl: string,
  baseUrl: string,
  feedIndex: number,
): { kind: "valid"; items: RssFeedItem[] } | { kind: "invalid"; error: string } {
  const text = raw.trim();
  if (!text) return { kind: "invalid", error: "empty feed payload" };

  if (text.startsWith("{")) {
    return parseJsonFeed(text, feedUrl, baseUrl, feedIndex);
  }

  const $ = cheerio.load(text, { xmlMode: true });
  const atomRoot = firstByLocalName($, "feed");
  if (atomRoot) {
    const items = parseAtomFeed($, atomRoot, feedUrl, baseUrl, feedIndex);
    return items.length > 0
      ? { kind: "valid", items }
      : { kind: "invalid", error: "feed contained no items" };
  }

  const channel = firstByLocalName($, "channel");
  const channelItems = channel ? childrenByLocalName(channel, ["item"]) : [];
  if (channel && channelItems.length > 0) {
    return {
      kind: "valid",
      items: parseRssLikeFeed($, channel, channelItems, "rss", feedUrl, baseUrl, feedIndex),
    };
  }

  const allItems = allByLocalName($, "item");
  if (allItems.length > 0) {
    const feedType = firstByLocalName($, "rdf") ? "rdf" : "rss";
    return {
      kind: "valid",
      items: parseRssLikeFeed(
        $,
        channel,
        allItems,
        feedType,
        feedUrl,
        baseUrl,
        feedIndex,
      ),
    };
  }

  return {
    kind: "invalid",
    error: "unsupported feed payload: expected RSS, Atom, RDF, or JSON Feed",
  };
}

function parseRssLikeFeed(
  $: cheerio.CheerioAPI,
  channel: Element | null,
  itemNodes: Element[],
  feedType: "rss" | "rdf",
  feedUrl: string,
  baseUrl: string,
  feedIndex: number,
): RssFeedItem[] {
  const feedTitle = channel ? childText($, channel, ["title"]) : null;
  const feedHomeUrl = channel
    ? absoluteUrl(childText($, channel, ["link"]), baseUrl)
    : null;

  return itemNodes.map((itemNode, index) => {
    const title = childText($, itemNode, ["title"]);
    const url =
      absoluteUrl(childText($, itemNode, ["link"]), baseUrl) ??
      absoluteUrl(attr(itemNode, "about"), baseUrl);
    const guid = childText($, itemNode, ["guid", "id"]);
    const rawDateText = childText($, itemNode, [
      "pubdate",
      "date",
      "published",
      "updated",
    ]);
    const publishedAt = isoDate(rawDateText);
    const updatedAt = isoDate(childText($, itemNode, ["updated", "modified"]));
    const summaryHtml = childHtml($, itemNode, ["description", "summary"]);
    const contentHtml = childHtml($, itemNode, ["encoded", "content"]);
    const enclosures = rssEnclosures(itemNode, baseUrl);

    const item: RssFeedItem = {
      feedUrl,
      feedIndex,
      feedTitle,
      feedHomeUrl,
      feedType,
      itemIndexInFeed: index + 1,
      title,
      url,
      guid,
      itemKey: "",
      publishedAt,
      updatedAt,
      authors: uniqueStrings(
        childTexts($, itemNode, ["creator", "author", "dc:creator"]),
      ),
      categories: uniqueStrings(childTexts($, itemNode, ["category", "subject"])),
      summaryText: htmlToText(summaryHtml),
      summaryHtml,
      contentText: htmlToText(contentHtml),
      contentHtml,
      imageUrl: rssImageUrl(itemNode, enclosures, baseUrl),
      enclosures,
      rawDateText,
    };
    item.itemKey = itemKey(item);
    return item;
  });
}

function parseAtomFeed(
  $: cheerio.CheerioAPI,
  feedNode: Element,
  feedUrl: string,
  baseUrl: string,
  feedIndex: number,
): RssFeedItem[] {
  const feedTitle = childText($, feedNode, ["title"]);
  const feedHomeUrl = atomLink(feedNode, baseUrl, "alternate") ?? atomLink(feedNode, baseUrl);

  return childrenByLocalName(feedNode, ["entry"]).map((entry, index) => {
    const title = childText($, entry, ["title"]);
    const url = atomLink(entry, baseUrl, "alternate") ?? atomLink(entry, baseUrl);
    const guid = childText($, entry, ["id"]);
    const rawDateText = childText($, entry, ["published", "updated"]);
    const summaryHtml = childHtml($, entry, ["summary"]);
    const contentHtml = childHtml($, entry, ["content"]);
    const enclosures = atomEnclosures(entry, baseUrl);

    const item: RssFeedItem = {
      feedUrl,
      feedIndex,
      feedTitle,
      feedHomeUrl,
      feedType: "atom",
      itemIndexInFeed: index + 1,
      title,
      url,
      guid,
      itemKey: "",
      publishedAt: isoDate(rawDateText),
      updatedAt: isoDate(childText($, entry, ["updated"])),
      authors: atomAuthors($, entry),
      categories: atomCategories(entry),
      summaryText: htmlToText(summaryHtml),
      summaryHtml,
      contentText: htmlToText(contentHtml),
      contentHtml,
      imageUrl: enclosures.find((item) => item.type?.startsWith("image/"))?.url ?? null,
      enclosures,
      rawDateText,
    };
    item.itemKey = itemKey(item);
    return item;
  });
}

function parseJsonFeed(
  raw: string,
  feedUrl: string,
  baseUrl: string,
  feedIndex: number,
): { kind: "valid"; items: RssFeedItem[] } | { kind: "invalid"; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { kind: "invalid", error: "invalid JSON Feed payload" };
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.items)) {
    return { kind: "invalid", error: "invalid JSON Feed payload" };
  }

  const feedTitle = stringValue(parsed.title);
  const feedHomeUrl = absoluteUrl(stringValue(parsed.home_page_url), baseUrl);
  const items = parsed.items
    .filter(isRecord)
    .map((entry, index): RssFeedItem => {
      const rawDateText = stringValue(entry.date_published) ?? stringValue(entry.date_modified);
      const url =
        absoluteUrl(stringValue(entry.url), baseUrl) ??
        absoluteUrl(stringValue(entry.external_url), baseUrl);
      const summaryHtml =
        stringValue(entry.summary) ??
        stringValue(entry.description) ??
        stringValue(entry.content_text);
      const contentHtml = stringValue(entry.content_html);
      const contentText = stringValue(entry.content_text) ?? htmlToText(contentHtml);
      const enclosures = jsonFeedEnclosures(entry, baseUrl);
      const imageUrl =
        absoluteUrl(stringValue(entry.image), baseUrl) ??
        absoluteUrl(stringValue(entry.banner_image), baseUrl) ??
        enclosures.find((item) => item.type?.startsWith("image/"))?.url ??
        null;

      const item: RssFeedItem = {
        feedUrl,
        feedIndex,
        feedTitle,
        feedHomeUrl,
        feedType: "json",
        itemIndexInFeed: index + 1,
        title: stringValue(entry.title),
        url,
        guid: stringValue(entry.id),
        itemKey: "",
        publishedAt: isoDate(rawDateText),
        updatedAt: isoDate(stringValue(entry.date_modified)),
        authors: jsonAuthors(entry),
        categories: arrayOfStrings(entry.tags),
        summaryText: htmlToText(summaryHtml),
        summaryHtml,
        contentText,
        contentHtml,
        imageUrl,
        enclosures,
        rawDateText,
      };
      item.itemKey = itemKey(item);
      return item;
    });

  return items.length > 0
    ? { kind: "valid", items }
    : { kind: "invalid", error: "feed contained no items" };
}

function rssEnclosures(itemNode: Element, baseUrl: string): RssFeedEnclosure[] {
  return childrenByLocalName(itemNode, ["enclosure"])
    .map((node) => enclosureFromAttrs(node, baseUrl))
    .filter((item): item is RssFeedEnclosure => Boolean(item));
}

function atomEnclosures(entry: Element, baseUrl: string): RssFeedEnclosure[] {
  return childrenByLocalName(entry, ["link"])
    .filter((node) => attr(node, "rel")?.toLowerCase() === "enclosure")
    .map((node) => enclosureFromAttrs(node, baseUrl, "href"))
    .filter((item): item is RssFeedEnclosure => Boolean(item));
}

function jsonFeedEnclosures(entry: Record<string, unknown>, baseUrl: string) {
  if (!Array.isArray(entry.attachments)) return [];
  return entry.attachments.filter(isRecord).flatMap((attachment) => {
    const url = absoluteUrl(stringValue(attachment.url), baseUrl);
    if (!url) return [];
    const size = attachment.size_in_bytes;
    return [
      {
        url,
        type: stringValue(attachment.mime_type),
        length:
          typeof size === "number"
            ? String(size)
            : typeof size === "string"
              ? size
              : null,
        title: stringValue(attachment.title),
      },
    ];
  });
}

function enclosureFromAttrs(
  node: Element,
  baseUrl: string,
  urlAttribute: "url" | "href" = "url",
): RssFeedEnclosure | null {
  const url = absoluteUrl(attr(node, urlAttribute), baseUrl);
  if (!url) return null;
  return {
    url,
    type: attr(node, "type"),
    length: attr(node, "length"),
    title: attr(node, "title"),
  };
}

function rssImageUrl(
  itemNode: Element,
  enclosures: RssFeedEnclosure[],
  baseUrl: string,
) {
  for (const child of childElements(itemNode)) {
    const name = localName(child);
    if (name === "thumbnail" || name === "content") {
      const url = attr(child, "url");
      const type = attr(child, "type");
      const medium = attr(child, "medium");
      if (url && (name === "thumbnail" || medium === "image" || type?.startsWith("image/"))) {
        return absoluteUrl(url, baseUrl);
      }
    }
    if (name === "image") {
      const href = attr(child, "href") ?? childTextFromNode(child, ["url"]);
      const imageUrl = absoluteUrl(href, baseUrl);
      if (imageUrl) return imageUrl;
    }
  }
  return enclosures.find((item) => item.type?.startsWith("image/"))?.url ?? null;
}

function atomAuthors($: cheerio.CheerioAPI, entry: Element) {
  const authors = childrenByLocalName(entry, ["author", "contributor"]).map(
    (author) => childText($, author, ["name", "email"]) ?? normalizeText($(author).text()),
  );
  return uniqueStrings(authors);
}

function atomCategories(entry: Element) {
  return uniqueStrings(
    childrenByLocalName(entry, ["category"]).flatMap((category) => [
      attr(category, "term"),
      attr(category, "label"),
    ]),
  );
}

function atomLink(entry: Element, baseUrl: string, preferredRel?: string) {
  const links = childrenByLocalName(entry, ["link"]);
  const selected =
    links.find((link) => {
      const rel = attr(link, "rel")?.toLowerCase() ?? "alternate";
      return preferredRel ? rel === preferredRel : true;
    }) ?? links[0];
  return selected ? absoluteUrl(attr(selected, "href"), baseUrl) : null;
}

function jsonAuthors(entry: Record<string, unknown>) {
  const authorValues: unknown[] = [];
  if (Array.isArray(entry.authors)) authorValues.push(...entry.authors);
  if (entry.author) authorValues.push(entry.author);
  return uniqueStrings(
    authorValues.flatMap((author) => {
      if (typeof author === "string") return [author];
      if (!isRecord(author)) return [];
      return [stringValue(author.name), stringValue(author.url)].filter(Boolean);
    }),
  );
}

function passesPublishedAfter(item: RssFeedItem, publishedAfterTime: number | null) {
  if (publishedAfterTime === null || !item.publishedAt) return true;
  return Date.parse(item.publishedAt) >= publishedAfterTime;
}

function itemKey(item: RssFeedItem) {
  return [
    item.feedUrl,
    item.guid ?? "",
    item.url ?? "",
    item.title ?? "",
    item.publishedAt ?? "",
  ].join("|");
}

function feedPayloadText(response: RssFeedReaderFetchResult) {
  if (typeof response.body_text === "string") return response.body_text;
  if (typeof response.html === "string") return response.html;
  if (response.json !== undefined) return JSON.stringify(response.json);
  return "";
}

function allByLocalName($: cheerio.CheerioAPI, name: string): Element[] {
  return $("*")
    .toArray()
    .filter((node): node is Element => isElement(node) && localName(node) === name);
}

function firstByLocalName($: cheerio.CheerioAPI, name: string): Element | null {
  return allByLocalName($, name)[0] ?? null;
}

function childrenByLocalName(node: Element, names: string[]) {
  const wanted = new Set(names.map((name) => name.toLowerCase()));
  return childElements(node).filter((child) => wanted.has(localName(child)));
}

function childText($: cheerio.CheerioAPI, node: Element, names: string[]) {
  for (const child of childrenByLocalName(node, names)) {
    const text = normalizeText($(child).text());
    if (text) return text;
  }
  return null;
}

function childTexts($: cheerio.CheerioAPI, node: Element, names: string[]) {
  return childrenByLocalName(node, names)
    .map((child) => normalizeText($(child).text()))
    .filter(Boolean);
}

function childHtml($: cheerio.CheerioAPI, node: Element, names: string[]) {
  for (const child of childrenByLocalName(node, names)) {
    const html = normalizeHtml($(child).html());
    if (html) return html;
  }
  return null;
}

function childTextFromNode(node: Element, names: string[]) {
  for (const child of childrenByLocalName(node, names)) {
    const text = normalizeText(textContent(child));
    if (text) return text;
  }
  return null;
}

function childElements(node: Element): Element[] {
  return (node.children ?? []).filter(isElement);
}

function isElement(node: AnyNode | unknown): node is Element {
  return (
    typeof node === "object" &&
    node !== null &&
    "name" in node &&
    typeof (node as { name?: unknown }).name === "string"
  );
}

function localName(node: Element) {
  return node.name.split(":").pop()?.toLowerCase() ?? node.name.toLowerCase();
}

function attr(node: Element, name: string) {
  const attributes = node.attribs ?? {};
  return normalizeText(attributes[name] ?? "") || null;
}

function absoluteUrl(value: string | null | undefined, baseUrl: string): string | null {
  const text = normalizeText(value ?? "");
  if (!text || text.startsWith("data:")) return null;
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

function isoDate(value: string | null | undefined) {
  if (!value) return null;
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return null;
  return new Date(time).toISOString();
}

function htmlToText(value: string | null) {
  if (!value) return null;
  const text = normalizeText(cheerio.load(value).text());
  return text || null;
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeHtml(value: string | null | undefined) {
  const html = value?.trim().replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "").trim();
  return html || null;
}

function textContent(node: Element): string {
  return childElements(node).length > 0
    ? childElements(node).map(textContent).join(" ")
    : (node.children ?? [])
        .map((child) => ("data" in child ? String(child.data) : ""))
        .join(" ");
}

function arrayOfStrings(value: unknown) {
  return Array.isArray(value)
    ? uniqueStrings(value.map((item) => (typeof item === "string" ? item : null)))
    : [];
}

function uniqueStrings(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const text = normalizeText(value ?? "");
    if (!text || seen.has(text)) continue;
    seen.add(text);
    result.push(text);
  }
  return result;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
