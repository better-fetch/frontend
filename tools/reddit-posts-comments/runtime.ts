import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import { z } from "zod";

const SOURCE_INPUT = z.string().trim().min(1).max(2_048);
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

export const REDDIT_POSTS_COMMENTS_INPUT_SCHEMA = z.object({
  sources: z.array(SOURCE_INPUT).min(1).max(100),
  sort: z.enum(["relevance", "hot", "new", "top", "comments"]).default("relevance"),
  timeRange: z.enum(["hour", "day", "week", "month", "year", "all"]).default("week"),
  maxPostsPerSource: z.number().int().min(1).max(500).default(25),
  includeComments: z.boolean().default(true),
  maxCommentsPerPost: z.number().int().min(0).max(500).default(50),
  countryCode: COUNTRY_CODE.default("us"),
  languageCode: LANGUAGE_CODE.default("en"),
  strategy: z.enum(["auto", "http", "browser"]).default("browser"),
  timeoutSecs: z.number().int().min(5).max(180).default(60),
});

export const REDDIT_POSTS_COMMENTS_MCP_INPUT_SCHEMA = {
  sources: z
    .array(SOURCE_INPUT)
    .min(1)
    .max(100)
    .describe("Reddit URLs, subreddit names like r/webscraping, user names like u/spez, or search queries"),
  sort: z
    .enum(["relevance", "hot", "new", "top", "comments"])
    .optional()
    .describe("Listing/search sort (default relevance)"),
  timeRange: z
    .enum(["hour", "day", "week", "month", "year", "all"])
    .optional()
    .describe("Top/search time range (default week)"),
  maxPostsPerSource: z
    .number()
    .int()
    .min(1)
    .max(500)
    .optional()
    .describe("Maximum posts returned for each source (default 25)"),
  includeComments: z.boolean().optional().describe("Include visible comments when present (default true)"),
  maxCommentsPerPost: z
    .number()
    .int()
    .min(0)
    .max(500)
    .optional()
    .describe("Maximum visible comments per post (default 50)"),
  countryCode: COUNTRY_CODE.optional().describe("Two-letter country code (default us)"),
  languageCode: LANGUAGE_CODE.optional().describe("Language code like en or en-US (default en)"),
  strategy: z
    .enum(["auto", "http", "browser"])
    .optional()
    .describe("Better Fetch strategy for each Reddit page (default browser)"),
  timeoutSecs: z
    .number()
    .int()
    .min(5)
    .max(180)
    .optional()
    .describe("Per-source timeout in seconds (default 60)"),
};

export type RedditPostsCommentsInput = z.input<typeof REDDIT_POSTS_COMMENTS_INPUT_SCHEMA>;
export type RedditPostsCommentsOptions = z.output<typeof REDDIT_POSTS_COMMENTS_INPUT_SCHEMA>;

export type RedditPostsCommentsFetchRequest = {
  url: string;
  timeoutSecs: number;
  strategy: "auto" | "http" | "browser";
  countryCode: string;
  languageCode: string;
};

export type RedditPostsCommentsFetchResult = {
  ok?: boolean;
  error?: string;
  message?: string;
  status?: number;
  final_url?: string;
  html?: string | null;
  body_text?: string | null;
  title?: string | null;
};

export type RedditPostsCommentsFetch = (
  request: RedditPostsCommentsFetchRequest,
) => Promise<RedditPostsCommentsFetchResult>;

export type RedditComment = {
  id: string | null;
  author: string | null;
  body: string | null;
  score: number | null;
  createdAt: string | null;
  permalink: string | null;
  parentId: string | null;
  depth: number | null;
};

export type RedditPost = {
  position: number;
  id: string | null;
  title: string;
  subreddit: string | null;
  author: string | null;
  body: string | null;
  url: string | null;
  permalink: string | null;
  score: number | null;
  upvoteRatio: number | null;
  commentCount: number | null;
  createdAt: string | null;
  flair: string | null;
  isNsfw: boolean | null;
  isSpoiler: boolean | null;
  mediaUrls: string[];
  outboundUrl: string | null;
  comments: RedditComment[];
};

export type RedditPostsCommentsRecord = {
  source: {
    input: string;
    inputIndex: number;
    url: string;
    finalUrl: string;
    type: "URL" | "SUBREDDIT" | "USER" | "SEARCH";
    sort: string;
    timeRange: string;
  };
  posts: RedditPost[];
};

export type RedditPostsCommentsError = {
  input: string;
  inputIndex: number;
  url: string | null;
  error: string;
  statusCode: number | null;
};

type SourceRequest = {
  input: string;
  inputIndex: number;
  url: string;
  type: "URL" | "SUBREDDIT" | "USER" | "SEARCH";
};

export async function scrapeRedditPostsComments(
  input: RedditPostsCommentsInput,
  fetchRedditPage: RedditPostsCommentsFetch,
) {
  const options = REDDIT_POSTS_COMMENTS_INPUT_SCHEMA.parse(input);
  const results: RedditPostsCommentsRecord[] = [];
  const errors: RedditPostsCommentsError[] = [];

  for (const [index, source] of options.sources.entries()) {
    let request: SourceRequest;
    try {
      request = buildSourceRequest(source, index + 1, options);
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

    let response: RedditPostsCommentsFetchResult;
    try {
      response = await fetchRedditPage({
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
      errors.push(errorRecord(request, "reddit page appears blocked", response.status ?? null));
      continue;
    }

    const finalUrl = normalizeUrl(response.final_url ?? request.url);
    const posts = parseRedditPosts(html, finalUrl, options).slice(0, options.maxPostsPerSource);
    if (posts.length === 0) {
      errors.push(
        errorRecord(request, "reddit page did not contain post data", response.status ?? null),
      );
      continue;
    }

    results.push({
      source: {
        input: request.input,
        inputIndex: request.inputIndex,
        url: request.url,
        finalUrl,
        type: request.type,
        sort: options.sort,
        timeRange: options.timeRange,
      },
      posts,
    });
  }

  const postCount = results.reduce((total, result) => total + result.posts.length, 0);
  const commentCount = results.reduce(
    (total, result) =>
      total + result.posts.reduce((postTotal, post) => postTotal + post.comments.length, 0),
    0,
  );
  return {
    ok: errors.length === 0,
    tool: "reddit_posts_comments",
    source_count: results.length,
    post_count: postCount,
    comment_count: commentCount,
    item_count: postCount + commentCount,
    results,
    errors,
  };
}

function buildSourceRequest(
  source: string,
  inputIndex: number,
  options: RedditPostsCommentsOptions,
): SourceRequest {
  const raw = source.trim();
  const inputUrl = parseInputUrl(raw);
  if (inputUrl) {
    if (!isRedditUrl(inputUrl)) throw new Error("URL input must be a Reddit URL");
    inputUrl.hash = "";
    return { input: raw, inputIndex, url: inputUrl.href, type: "URL" };
  }

  const subreddit = raw.match(/^\/?r\/([A-Za-z0-9_]{2,21})\/?$/)?.[1];
  if (subreddit) {
    const url = new URL(`https://www.reddit.com/r/${subreddit}/${listingSort(options.sort)}/`);
    if (options.sort === "top" || options.sort === "comments") {
      url.searchParams.set("t", options.timeRange);
    }
    return { input: raw, inputIndex, url: url.href, type: "SUBREDDIT" };
  }

  const user = raw.match(/^\/?u(?:ser)?\/([A-Za-z0-9_-]{2,20})\/?$/)?.[1];
  if (user) {
    const url = new URL(`https://www.reddit.com/user/${user}/submitted/`);
    url.searchParams.set("sort", listingSort(options.sort));
    if (options.sort === "top" || options.sort === "comments") {
      url.searchParams.set("t", options.timeRange);
    }
    return { input: raw, inputIndex, url: url.href, type: "USER" };
  }

  const url = new URL("https://www.reddit.com/search/");
  url.searchParams.set("q", raw);
  url.searchParams.set("sort", options.sort);
  url.searchParams.set("t", options.timeRange);
  return { input: raw, inputIndex, url: url.href, type: "SEARCH" };
}

function parseRedditPosts(
  html: string,
  pageUrl: string,
  options: RedditPostsCommentsOptions,
): RedditPost[] {
  const $ = cheerio.load(html);
  const domPosts = parseDomPosts($, pageUrl, options);
  const jsonLdPosts = parseJsonLdPosts($, pageUrl, options);
  return dedupePosts([...domPosts, ...jsonLdPosts]);
}

function parseDomPosts(
  $: cheerio.CheerioAPI,
  pageUrl: string,
  options: RedditPostsCommentsOptions,
): RedditPost[] {
  const selectors = [
    "shreddit-post",
    "[data-testid='post-container']",
    "article[data-post-id]",
    "div[data-click-id='body']",
  ];
  const posts: RedditPost[] = [];
  const seen = new Set<AnyNode>();
  for (const selector of selectors) {
    $(selector).each((_, element) => {
      if (seen.has(element)) return;
      const node = $(element);
      const title = postTitle($, node);
      if (!title) return;
      seen.add(element);
      const permalink = normalizeExternalUrl(
        attr(node, "permalink") ??
          attr(node, "data-permalink") ??
          node.find("a[href*='/comments/']").first().attr("href"),
        pageUrl,
      );
      const comments = options.includeComments
        ? parseComments($, node, pageUrl).slice(0, options.maxCommentsPerPost)
        : [];
      posts.push({
        position: posts.length + 1,
        id: attr(node, "id") ?? attr(node, "post-id") ?? attr(node, "data-post-id"),
        title,
        subreddit:
          cleanSubreddit(attr(node, "subreddit-name") ?? firstSubreddit(node)) ??
          subredditFromUrl(permalink ?? pageUrl),
        author: cleanAuthor(attr(node, "author") ?? firstAuthor(node)),
        body:
          firstText(node, "[slot='text-body'], [data-click-id='text'], .md, .usertext-body") ??
          null,
        url: normalizeExternalUrl(attr(node, "content-href") ?? attr(node, "url"), pageUrl),
        permalink,
        score: parseNumber(attr(node, "score") ?? firstText(node, "[id*='score'], [aria-label*='upvote']") ?? ""),
        upvoteRatio: parseRatio(attr(node, "upvote-ratio") ?? ""),
        commentCount: parseNumber(
          attr(node, "comment-count") ??
            firstText(node, "a[href*='/comments/'], [data-click-id='comments']") ??
            "",
        ),
        createdAt:
          attr(node, "created-timestamp") ??
          node.find("time").first().attr("datetime") ??
          null,
        flair: attr(node, "post-flair") ?? firstText(node, "[slot='post-flair'], .linkflairlabel"),
        isNsfw: booleanAttr(node, "nsfw"),
        isSpoiler: booleanAttr(node, "spoiler"),
        mediaUrls: mediaUrls($, node, pageUrl),
        outboundUrl: outboundUrl($, node, pageUrl, permalink),
        comments,
      });
    });
  }
  return posts;
}

function parseJsonLdPosts(
  $: cheerio.CheerioAPI,
  pageUrl: string,
  options: RedditPostsCommentsOptions,
): RedditPost[] {
  const posts: RedditPost[] = [];
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
      const types = Array.isArray(type) ? type : [type];
      if (!types.some((value) => typeof value === "string" && /posting|article/i.test(value))) {
        continue;
      }
      const comments = options.includeComments
        ? jsonLdComments(item, pageUrl).slice(0, options.maxCommentsPerPost)
        : [];
      const url = normalizeExternalUrl(stringValue(item.url), pageUrl);
      posts.push({
        position: posts.length + 1,
        id: idFromPermalink(url),
        title: stringValue(item.headline) ?? stringValue(item.name) ?? "",
        subreddit: subredditFromUrl(url ?? pageUrl),
        author: authorName(item.author),
        body: stringValue(item.articleBody) ?? stringValue(item.text) ?? null,
        url,
        permalink: url,
        score: parseNumber(String(item.upvoteCount ?? "")),
        upvoteRatio: null,
        commentCount:
          parseNumber(String(item.commentCount ?? "")) ??
          (Array.isArray(item.comment) ? item.comment.length : null),
        createdAt: stringValue(item.datePublished) ?? stringValue(item.dateCreated),
        flair: null,
        isNsfw: null,
        isSpoiler: null,
        mediaUrls: imageValues(item.image, pageUrl),
        outboundUrl: null,
        comments,
      });
    }
  });
  return posts.filter((post) => post.title);
}

function parseComments(
  $: cheerio.CheerioAPI,
  root: cheerio.Cheerio<AnyNode>,
  pageUrl: string,
): RedditComment[] {
  const comments: RedditComment[] = [];
  root.find("shreddit-comment, [data-testid='comment'], div.comment").each((_, element) => {
    const node = $(element);
    const body =
      firstText(node, "[slot='comment'], [data-testid='comment'], .md, .usertext-body") ??
      firstText(node, "p");
    if (!body) return;
    comments.push({
      id: attr(node, "thingid") ?? attr(node, "comment-id") ?? attr(node, "data-fullname"),
      author: cleanAuthor(attr(node, "author") ?? firstAuthor(node)),
      body,
      score: parseNumber(attr(node, "score") ?? firstText(node, "[id*='score']") ?? ""),
      createdAt:
        attr(node, "created-timestamp") ??
        node.find("time").first().attr("datetime") ??
        null,
      permalink: normalizeExternalUrl(
        attr(node, "permalink") ?? node.find("a[href*='/comments/']").first().attr("href"),
        pageUrl,
      ),
      parentId: attr(node, "parentid") ?? attr(node, "parent-id"),
      depth: parseNumber(attr(node, "depth") ?? attr(node, "data-depth") ?? ""),
    });
  });
  return comments;
}

function jsonLdComments(item: Record<string, unknown>, pageUrl: string): RedditComment[] {
  const comments = Array.isArray(item.comment) ? item.comment : [];
  return comments
    .filter(isRecord)
    .map((comment): RedditComment => ({
      id: idFromPermalink(normalizeExternalUrl(stringValue(comment.url), pageUrl)),
      author: authorName(comment.author),
      body: stringValue(comment.text) ?? stringValue(comment.commentText),
      score: parseNumber(String(comment.upvoteCount ?? "")),
      createdAt: stringValue(comment.datePublished) ?? stringValue(comment.dateCreated),
      permalink: normalizeExternalUrl(stringValue(comment.url), pageUrl),
      parentId: null,
      depth: null,
    }))
    .filter((comment) => Boolean(comment.body));
}

function postTitle($: cheerio.CheerioAPI, node: cheerio.Cheerio<AnyNode>): string | null {
  return (
    attr(node, "post-title") ??
    attr(node, "aria-label") ??
    firstText(node, "[slot='title'], h1, h2, h3, a[data-click-id='body']") ??
    firstText(node, "a.title")
  );
}

function firstAuthor(node: cheerio.Cheerio<AnyNode>): string | null {
  return (
    node.find("a[href*='/user/'], a[href*='/u/']").first().text() ||
    node.find("[data-testid='post_author_link']").first().text() ||
    ""
  ).trim() || null;
}

function firstSubreddit(node: cheerio.Cheerio<AnyNode>): string | null {
  return (
    node.find("a[href*='/r/']").first().text() ||
    node.find("[data-testid='subreddit-name']").first().text() ||
    ""
  ).trim() || null;
}

function firstText(node: cheerio.Cheerio<AnyNode>, selector: string): string | null {
  const text = normalizeText(node.find(selector).first().text());
  return text || null;
}

function attr(node: cheerio.Cheerio<AnyNode>, name: string): string | null {
  return normalizeText(node.attr(name) ?? "") || null;
}

function mediaUrls(
  $: cheerio.CheerioAPI,
  node: cheerio.Cheerio<AnyNode>,
  pageUrl: string,
): string[] {
  const urls = node
    .find("img[src], source[src], video[src], a[href*='i.redd.it'], a[href*='v.redd.it']")
    .toArray()
    .flatMap((element) => [$(element).attr("src"), $(element).attr("href")])
    .map((url) => normalizeExternalUrl(url, pageUrl))
    .filter(isString);
  return [...new Set(urls)];
}

function outboundUrl(
  $: cheerio.CheerioAPI,
  node: cheerio.Cheerio<AnyNode>,
  pageUrl: string,
  permalink: string | null,
): string | null {
  const url = normalizeExternalUrl(
      attr(node, "content-href") ??
      attr(node, "url") ??
      node.find("a[href^='http']").toArray().map((element) => $(element).attr("href")).find(Boolean),
    pageUrl,
  );
  if (!url || isRedditHref(url) || url === permalink) return null;
  return url;
}

function cleanAuthor(value: string | null): string | null {
  return value?.replace(/^u\//i, "").replace(/^posted by\s+/i, "").trim() || null;
}

function cleanSubreddit(value: string | null): string | null {
  return value?.replace(/^r\//i, "").trim() || null;
}

function subredditFromUrl(value: string | null): string | null {
  if (!value) return null;
  const match = value.match(/\/r\/([^/]+)/i);
  return match?.[1] ?? null;
}

function idFromPermalink(value: string | null): string | null {
  if (!value) return null;
  const match = value.match(/\/comments\/([^/]+)/i);
  return match?.[1] ?? null;
}

function authorName(value: unknown): string | null {
  if (typeof value === "string") return cleanAuthor(value);
  if (isRecord(value)) return cleanAuthor(stringValue(value.name) ?? stringValue(value.url));
  return null;
}

function imageValues(value: unknown, baseUrl: string): string[] {
  if (typeof value === "string") {
    return [normalizeExternalUrl(value, baseUrl)].filter(isString);
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => imageValues(item, baseUrl));
  }
  if (isRecord(value)) {
    return imageValues(value.url, baseUrl);
  }
  return [];
}

function flattenJsonLd(value: unknown): unknown[] {
  if (Array.isArray(value)) return value.flatMap(flattenJsonLd);
  if (!isRecord(value)) return [];
  const graph = value["@graph"];
  return [value, ...(Array.isArray(graph) ? graph.flatMap(flattenJsonLd) : [])];
}

function dedupePosts(posts: RedditPost[]): RedditPost[] {
  const seen = new Set<string>();
  const deduped: RedditPost[] = [];
  for (const post of posts) {
    const key = `${post.id ?? ""}\n${post.permalink ?? ""}\n${post.title}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push({ ...post, position: deduped.length + 1 });
  }
  return deduped;
}

function parseNumber(value: string): number | null {
  const compact = value.match(/\b([\d,.]+)\s*([KMB])\b/i);
  if (compact) {
    const base = Number.parseFloat(compact[1].replace(/,/g, ""));
    const multiplier = { K: 1_000, M: 1_000_000, B: 1_000_000_000 }[
      compact[2].toUpperCase() as "K" | "M" | "B"
    ];
    return Number.isFinite(base) ? Math.round(base * multiplier) : null;
  }
  const plain = value.match(/-?\b\d[\d,]*\b/);
  if (!plain) return null;
  const number = Number.parseInt(plain[0].replace(/,/g, ""), 10);
  return Number.isFinite(number) ? number : null;
}

function parseRatio(value: string): number | null {
  const number = Number.parseFloat(value);
  if (!Number.isFinite(number)) return null;
  return number > 1 ? number / 100 : number;
}

function booleanAttr(node: cheerio.Cheerio<AnyNode>, name: string): boolean | null {
  const value = node.attr(name);
  if (value === undefined) return null;
  if (value === "" || value.toLowerCase() === "true") return true;
  if (value.toLowerCase() === "false") return false;
  return null;
}

function listingSort(sort: RedditPostsCommentsOptions["sort"]) {
  return sort === "relevance" ? "hot" : sort;
}

function parseInputUrl(value: string): URL | null {
  if (!/^https?:\/\//i.test(value)) return null;
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function isRedditUrl(url: URL) {
  const hostname = url.hostname.replace(/^www\./, "").toLowerCase();
  return hostname === "reddit.com" || hostname.endsWith(".reddit.com") || hostname === "redd.it";
}

function isRedditHref(value: string) {
  try {
    return isRedditUrl(new URL(value));
  } catch {
    return false;
  }
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

function normalizeUrl(url: string) {
  const parsed = new URL(url);
  parsed.hash = "";
  return parsed.href;
}

function looksBlocked(html: string) {
  return /blocked|captcha|rate limit|too many requests|request has been blocked/i.test(html);
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
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
  request: SourceRequest,
  error: string,
  statusCode: number | null,
): RedditPostsCommentsError {
  return {
    input: request.input,
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
