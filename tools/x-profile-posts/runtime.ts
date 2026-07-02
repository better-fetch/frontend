import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";
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

export const X_PROFILE_POSTS_INPUT_SCHEMA = z.object({
  targets: z.array(TARGET_INPUT).min(1).max(100),
  sort: z.enum(["latest", "top"]).default("latest"),
  maxPostsPerTarget: z.number().int().min(1).max(500).default(25),
  includeReplies: z.boolean().default(false),
  countryCode: COUNTRY_CODE.default("us"),
  languageCode: LANGUAGE_CODE.default("en"),
  strategy: z.enum(["auto", "http", "browser"]).default("browser"),
  timeoutSecs: z.number().int().min(5).max(180).default(60),
});

export const X_PROFILE_POSTS_MCP_INPUT_SCHEMA = {
  targets: z
    .array(TARGET_INPUT)
    .min(1)
    .max(100)
    .describe("X handles, profile URLs, post/status URLs, search URLs, hashtags, or search queries"),
  sort: z.enum(["latest", "top"]).optional().describe("Search result sort (default latest)"),
  maxPostsPerTarget: z
    .number()
    .int()
    .min(1)
    .max(500)
    .optional()
    .describe("Maximum posts returned for each target (default 25)"),
  includeReplies: z.boolean().optional().describe("Include reply posts when present (default false)"),
  countryCode: COUNTRY_CODE.optional().describe("Two-letter country code (default us)"),
  languageCode: LANGUAGE_CODE.optional().describe("Language code like en or en-US (default en)"),
  strategy: z
    .enum(["auto", "http", "browser"])
    .optional()
    .describe("Better Fetch strategy for each X page (default browser)"),
  timeoutSecs: z
    .number()
    .int()
    .min(5)
    .max(180)
    .optional()
    .describe("Per-target timeout in seconds (default 60)"),
};

export type XProfilePostsInput = z.input<typeof X_PROFILE_POSTS_INPUT_SCHEMA>;
export type XProfilePostsOptions = z.output<typeof X_PROFILE_POSTS_INPUT_SCHEMA>;

export type XProfilePostsFetchRequest = {
  url: string;
  timeoutSecs: number;
  strategy: "auto" | "http" | "browser";
  countryCode: string;
  languageCode: string;
};

export type XProfilePostsFetchResult = {
  ok?: boolean;
  error?: string;
  message?: string;
  status?: number;
  final_url?: string;
  html?: string | null;
  body_text?: string | null;
  title?: string | null;
};

export type XProfilePostsFetch = (
  request: XProfilePostsFetchRequest,
) => Promise<XProfilePostsFetchResult>;

export type XProfile = {
  username: string | null;
  displayName: string | null;
  bio: string | null;
  followerCount: number | null;
  followingCount: number | null;
  postCount: number | null;
  location: string | null;
  websiteUrl: string | null;
  profileImageUrl: string | null;
  isVerified: boolean | null;
  joinedAt: string | null;
};

export type XPost = {
  position: number;
  id: string | null;
  text: string | null;
  authorUsername: string | null;
  authorDisplayName: string | null;
  timestamp: string | null;
  likeCount: number | null;
  repostCount: number | null;
  replyCount: number | null;
  quoteCount: number | null;
  bookmarkCount: number | null;
  viewCount: number | null;
  mediaUrls: string[];
  permalink: string | null;
  hashtags: string[];
  mentions: string[];
  urls: string[];
  language: string | null;
  isReply: boolean | null;
  isQuote: boolean | null;
  inReplyToId: string | null;
  quotedPostId: string | null;
};

export type XProfilePostsRecord = {
  target: {
    input: string;
    inputIndex: number;
    url: string;
    finalUrl: string;
    type: "PROFILE" | "POST" | "SEARCH";
    sort: string;
    countryCode: string;
    languageCode: string;
  };
  profile: XProfile | null;
  posts: XPost[];
};

export type XProfilePostsError = {
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
  type: "PROFILE" | "POST" | "SEARCH";
};

type PostSeed = {
  rest_id?: unknown;
  id_str?: unknown;
  id?: unknown;
  url?: unknown;
  legacy?: unknown;
  core?: unknown;
  views?: unknown;
  quoted_status_result?: unknown;
  quoted_status_permalink?: unknown;
  full_text?: unknown;
  text?: unknown;
  created_at?: unknown;
  favorite_count?: unknown;
  retweet_count?: unknown;
  reply_count?: unknown;
  quote_count?: unknown;
  bookmark_count?: unknown;
  lang?: unknown;
  entities?: unknown;
  extended_entities?: unknown;
};

export async function scrapeXProfilePosts(
  input: XProfilePostsInput,
  fetchXPage: XProfilePostsFetch,
) {
  const options = X_PROFILE_POSTS_INPUT_SCHEMA.parse(input);
  const results: XProfilePostsRecord[] = [];
  const errors: XProfilePostsError[] = [];

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

    let response: XProfilePostsFetchResult;
    try {
      response = await fetchXPage({
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
    const parsed = parseXPage(html, finalUrl, options);

    if (looksBlocked(html) && !parsed.profile && parsed.posts.length === 0) {
      errors.push(
        errorRecord(
          request,
          "x page appears blocked, unavailable, or login-gated",
          response.status ?? null,
        ),
      );
      continue;
    }

    if (!parsed.profile && parsed.posts.length === 0) {
      errors.push(
        errorRecord(
          request,
          "x page did not contain profile or post data",
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
        countryCode: options.countryCode,
        languageCode: options.languageCode,
      },
      profile: parsed.profile,
      posts: parsed.posts.slice(0, options.maxPostsPerTarget),
    });
  }

  const profileCount = results.filter((result) => result.profile).length;
  const postCount = results.reduce((total, result) => total + result.posts.length, 0);
  return {
    ok: errors.length === 0,
    tool: "x_profile_posts",
    target_count: results.length,
    profile_count: profileCount,
    post_count: postCount,
    item_count: profileCount + postCount,
    results,
    errors,
  };
}

function buildTargetRequest(
  target: string,
  inputIndex: number,
  options: XProfilePostsOptions,
): TargetRequest {
  const raw = target.trim();
  const inputUrl = parseInputUrl(raw);
  if (inputUrl) {
    if (!isXUrl(inputUrl)) {
      throw new Error("Input must be an X profile/post URL, handle, hashtag, or search query");
    }
    const normalized = normalizeXUrl(inputUrl, options);
    return { input: raw, inputIndex, url: normalized.url, type: normalized.type };
  }

  const hashtag = raw.match(/^#([A-Za-z0-9_]{1,139})$/)?.[1];
  if (hashtag) {
    return {
      input: raw,
      inputIndex,
      url: searchUrl(`#${hashtag}`, options),
      type: "SEARCH",
    };
  }

  const handle = raw.match(/^@?([A-Za-z0-9_]{1,15})$/)?.[1];
  if (handle && !raw.includes(" ")) {
    const url = new URL(`https://x.com/${handle}`);
    url.searchParams.set("lang", options.languageCode);
    return { input: raw, inputIndex, url: url.href, type: "PROFILE" };
  }

  return { input: raw, inputIndex, url: searchUrl(raw, options), type: "SEARCH" };
}

function normalizeXUrl(
  inputUrl: URL,
  options: XProfilePostsOptions,
): { url: string; type: TargetRequest["type"] } {
  const pathParts = inputUrl.pathname.split("/").filter(Boolean);
  const first = pathParts[0] ?? "";
  const second = pathParts[1] ?? "";
  const third = pathParts[2] ?? "";
  if (first.toLowerCase() === "search") {
    const query = inputUrl.searchParams.get("q") ?? "";
    return { url: searchUrl(query, options), type: "SEARCH" };
  }
  const url = new URL("https://x.com/");
  url.searchParams.set("lang", options.languageCode);
  if (first.toLowerCase() === "i" && second.toLowerCase() === "web" && third.toLowerCase() === "status" && pathParts[3]) {
    url.pathname = `/i/web/status/${pathParts[3]}`;
    return { url: url.href, type: "POST" };
  }
  if (first && second.toLowerCase() === "status" && third) {
    url.pathname = `/${first}/status/${third}`;
    return { url: url.href, type: "POST" };
  }
  if (first && /^[A-Za-z0-9_]{1,15}$/.test(first)) {
    url.pathname = `/${first}`;
    return { url: url.href, type: "PROFILE" };
  }
  throw new Error("Input must be an X profile/post URL, handle, hashtag, or search query");
}

function searchUrl(query: string, options: XProfilePostsOptions): string {
  const url = new URL("https://x.com/search");
  url.searchParams.set("q", query);
  url.searchParams.set("src", "typed_query");
  url.searchParams.set("f", options.sort === "latest" ? "live" : "top");
  url.searchParams.set("lang", options.languageCode);
  return url.href;
}

function parseXPage(html: string, pageUrl: string, options: XProfilePostsOptions) {
  const $ = cheerio.load(html);
  const embedded = extractEmbeddedJson($);
  const profile = mergeProfiles(
    [
      ...embedded.map(profileFromJson).filter(isProfile),
      profileFromMeta($, pageUrl),
      profileFromDom($, pageUrl),
    ].filter(isProfile),
  );
  const posts = dedupePosts([
    ...embedded.flatMap((value) => postsFromJson(value, pageUrl, options)),
    ...postsFromJsonLd($, pageUrl),
    ...postsFromDom($, pageUrl),
  ])
    .filter((post) => options.includeReplies || !post.isReply)
    .slice(0, options.maxPostsPerTarget);
  return { profile, posts };
}

function profileFromMeta($: CheerioAPI, pageUrl: string): XProfile | null {
  const title = meta($, "og:title") ?? $("title").first().text();
  const description = meta($, "og:description") ?? meta($, "description");
  const image = meta($, "og:image");
  const username =
    handleFromProfileUrl(pageUrl) ??
    cleanHandle(title.match(/@([A-Za-z0-9_]{1,15})/)?.[1]);
  const displayName = normalizeText(title.replace(/\(@[^)]*\).*/g, "").replace(/\|.*$/g, ""));
  if (!username && !displayName && !description && !image) return null;
  return {
    username,
    displayName: displayName || null,
    bio: description,
    followerCount: parseLabeledMetric(description ?? "", "Followers"),
    followingCount: parseLabeledMetric(description ?? "", "Following"),
    postCount: parseLabeledMetric(description ?? "", "Posts"),
    location: null,
    websiteUrl: null,
    profileImageUrl: image,
    isVerified: null,
    joinedAt: null,
  };
}

function profileFromDom($: CheerioAPI, pageUrl: string): XProfile | null {
  const username =
    cleanHandle($("[data-testid='UserName']").first().text().match(/@([A-Za-z0-9_]{1,15})/)?.[1]) ??
    handleFromProfileUrl(pageUrl);
  const displayName = normalizeText($("[data-testid='UserName']").first().find("span").first().text()) || null;
  if (!username && !displayName) return null;
  return {
    username,
    displayName,
    bio: normalizeText($("[data-testid='UserDescription']").first().text()) || null,
    followerCount: parseNumber($("a[href$='/verified_followers'], a[href$='/followers']").first().text()),
    followingCount: parseNumber($("a[href$='/following']").first().text()),
    postCount: null,
    location: normalizeText($("[data-testid='UserLocation']").first().text()) || null,
    websiteUrl: normalizeExternalUrl($("[data-testid='UserUrl'] a").first().attr("href"), pageUrl),
    profileImageUrl: normalizeExternalUrl($("img[src*='profile_images']").first().attr("src"), pageUrl),
    isVerified: null,
    joinedAt: normalizeText($("[data-testid='UserJoinDate']").first().text()) || null,
  };
}

function profileFromJson(value: unknown): XProfile | null {
  for (const record of collectRecords(value)) {
    const legacy = legacyRecord(record);
    if (!isProfileCandidate(record, legacy)) continue;
    const username =
      cleanHandle(stringValue(legacy.screen_name) ?? stringValue(record.screen_name)) ?? null;
    const profile: XProfile = {
      username,
      displayName: stringValue(legacy.name) ?? stringValue(record.name),
      bio: stringValue(legacy.description) ?? stringValue(record.description),
      followerCount:
        countValue(legacy.followers_count) ?? countValue(record.followers_count),
      followingCount:
        countValue(legacy.friends_count) ?? countValue(record.friends_count),
      postCount: countValue(legacy.statuses_count) ?? countValue(record.statuses_count),
      location: stringValue(legacy.location) ?? stringValue(record.location),
      websiteUrl:
        expandedUrlFromEntities(legacy.entities) ??
        stringValue(legacy.url) ??
        stringValue(record.url),
      profileImageUrl:
        stringValue(legacy.profile_image_url_https) ??
        stringValue(legacy.profile_image_url) ??
        stringValue(record.profile_image_url_https),
      isVerified: booleanValue(legacy.verified) ?? booleanValue(record.verified) ?? null,
      joinedAt: dateValue(legacy.created_at ?? record.created_at),
    };
    if (profile.username || profile.displayName || profile.bio) return profile;
  }
  return null;
}

function postsFromJson(
  value: unknown,
  pageUrl: string,
  options: XProfilePostsOptions,
): XPost[] {
  return collectRecords(value)
    .filter(isPostCandidate)
    .map((record, index) => postFromSeed(record as PostSeed, pageUrl, index + 1))
    .filter(isPost)
    .filter((post) => options.includeReplies || !post.isReply);
}

function postsFromJsonLd($: CheerioAPI, pageUrl: string): XPost[] {
  const posts: XPost[] = [];
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
      if (!types.some((value) => typeof value === "string" && /socialmediaposting|discussionforumposting/i.test(value))) {
        continue;
      }
      posts.push(
        postFromSeed(
          {
            id: postIdFromUrl(stringValue(item.url) ?? pageUrl),
            url: item.url,
            text: item.text ?? item.description ?? item.name,
            created_at: item.datePublished,
            core: { user_results: { result: { legacy: item.author } } },
            entities: { media: imageValues(item.image, pageUrl).map((url) => ({ media_url_https: url })) },
          },
          pageUrl,
          posts.length + 1,
        ),
      );
    }
  });
  return posts.filter(isPost);
}

function postsFromDom($: CheerioAPI, pageUrl: string): XPost[] {
  const posts: XPost[] = [];
  $("article[data-testid='tweet'], article").each((_, element) => {
    const node = $(element);
    const permalink = normalizeExternalUrl(node.find("a[href*='/status/']").first().attr("href"), pageUrl);
    const id = postIdFromUrl(permalink);
    const text = normalizeText(node.find("[data-testid='tweetText']").first().text()) || null;
    if (!id && !text) return;
    const authorLink = node.find("a[href^='/'][href*='/status/']").first().attr("href") ??
      node.find("a[href^='/']").first().attr("href");
    const mediaUrls = node
      .find("img[src], video[src], source[src]")
      .toArray()
      .map((item) => normalizeExternalUrl($(item).attr("src"), pageUrl))
      .filter(isString)
      .filter((url) => !url.includes("profile_images"));
    posts.push({
      position: posts.length + 1,
      id,
      text,
      authorUsername: cleanHandle(authorLink?.match(/^\/([^/]+)/)?.[1]),
      authorDisplayName: normalizeText(node.find("[data-testid='User-Name'] span").first().text()) || null,
      timestamp: node.find("time").first().attr("datetime") ?? null,
      likeCount: parseNumber(node.find("[data-testid='like']").first().text()),
      repostCount: parseNumber(node.find("[data-testid='retweet']").first().text()),
      replyCount: parseNumber(node.find("[data-testid='reply']").first().text()),
      quoteCount: null,
      bookmarkCount: null,
      viewCount: parseNumber(node.find("a[href$='/analytics']").first().text()),
      mediaUrls: uniqueStrings(mediaUrls),
      permalink,
      hashtags: extractHashtags(text),
      mentions: extractMentions(text),
      urls: extractUrls(text),
      language: null,
      isReply: Boolean(node.find("a[href*='/status/']").length > 1),
      isQuote: null,
      inReplyToId: null,
      quotedPostId: null,
    });
  });
  return posts;
}

function postFromSeed(seed: PostSeed, pageUrl: string, position: number): XPost {
  const legacy = legacyRecord(seed);
  const id =
    stringValue(seed.rest_id) ??
    stringValue(legacy.id_str) ??
    stringValue(seed.id_str) ??
    stringValue(seed.id) ??
    postIdFromUrl(stringValue(seed.url) ?? pageUrl);
  const author = authorRecord(seed);
  const username = cleanHandle(stringValue(author.screen_name) ?? stringValue(author.username));
  const permalink = normalizeExternalUrl(
    stringValue(seed.url) ?? (id && username ? `https://x.com/${username}/status/${id}` : null),
    pageUrl,
  );
  const text = stringValue(legacy.full_text) ?? stringValue(legacy.text) ?? stringValue(seed.full_text) ?? stringValue(seed.text);
  const mediaUrls = mediaValues(legacy.entities, pageUrl).concat(mediaValues(legacy.extended_entities, pageUrl));
  const quotedId =
    stringValue((isRecord(seed.quoted_status_result) ? seed.quoted_status_result.rest_id : null)) ??
    postIdFromUrl(stringValue(seed.quoted_status_permalink));
  return {
    position,
    id,
    text,
    authorUsername: username,
    authorDisplayName: stringValue(author.name),
    timestamp: dateValue(legacy.created_at ?? seed.created_at),
    likeCount: countValue(legacy.favorite_count ?? seed.favorite_count),
    repostCount: countValue(legacy.retweet_count ?? seed.retweet_count),
    replyCount: countValue(legacy.reply_count ?? seed.reply_count),
    quoteCount: countValue(legacy.quote_count ?? seed.quote_count),
    bookmarkCount: countValue(legacy.bookmark_count ?? seed.bookmark_count),
    viewCount: countValue(isRecord(seed.views) ? seed.views.count : null),
    mediaUrls: uniqueStrings(mediaUrls),
    permalink,
    hashtags: uniqueStrings([...entityHashtags(legacy.entities), ...extractHashtags(text)]),
    mentions: uniqueStrings([...entityMentions(legacy.entities), ...extractMentions(text)]),
    urls: uniqueStrings([...entityUrls(legacy.entities), ...extractUrls(text)]),
    language: stringValue(legacy.lang ?? seed.lang),
    isReply: Boolean(legacy.in_reply_to_status_id_str || legacy.in_reply_to_user_id_str),
    isQuote: Boolean(legacy.is_quote_status || quotedId),
    inReplyToId: stringValue(legacy.in_reply_to_status_id_str),
    quotedPostId: quotedId,
  };
}

function extractEmbeddedJson($: CheerioAPI): unknown[] {
  const values: unknown[] = [];
  $("script[type='application/json'], script#__NEXT_DATA__").each((_, element) => {
    const text = $(element).text().trim();
    if (!text) return;
    try {
      values.push(JSON.parse(text));
    } catch {
      // Ignore non-JSON script payloads.
    }
  });
  return values;
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

function legacyRecord(value: unknown): Record<string, unknown> {
  if (isRecord(value) && isRecord(value.legacy)) return value.legacy;
  return isRecord(value) ? value : {};
}

function authorRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) return {};
  const core = value.core;
  if (
    isRecord(core) &&
    isRecord(core.user_results) &&
    isRecord(core.user_results.result)
  ) {
    return legacyRecord(core.user_results.result);
  }
  if (isRecord(value.author)) return legacyRecord(value.author);
  return {};
}

function isProfileCandidate(record: Record<string, unknown>, legacy: Record<string, unknown>): boolean {
  return Boolean(
    (legacy.screen_name || record.screen_name) &&
      (legacy.description || legacy.followers_count || legacy.statuses_count || legacy.name),
  );
}

function isPostCandidate(record: Record<string, unknown>): boolean {
  const legacy = legacyRecord(record);
  if (
    (record.rest_id || record.id_str) &&
    (record.core || record.views || record.quoted_status_result || record.quoted_status_permalink) &&
    (legacy.full_text || legacy.text || record.full_text || record.text)
  ) {
    return true;
  }
  const url = stringValue(record.url);
  return Boolean(url && /\/status\/\d+/i.test(url));
}

function mergeProfiles(profiles: XProfile[]): XProfile | null {
  if (profiles.length === 0) return null;
  return profiles.reduce<XProfile>(
    (merged, profile) => ({
      username: merged.username ?? profile.username,
      displayName: merged.displayName ?? profile.displayName,
      bio: merged.bio ?? profile.bio,
      followerCount: merged.followerCount ?? profile.followerCount,
      followingCount: merged.followingCount ?? profile.followingCount,
      postCount: merged.postCount ?? profile.postCount,
      location: merged.location ?? profile.location,
      websiteUrl: merged.websiteUrl ?? profile.websiteUrl,
      profileImageUrl: merged.profileImageUrl ?? profile.profileImageUrl,
      isVerified: merged.isVerified ?? profile.isVerified,
      joinedAt: merged.joinedAt ?? profile.joinedAt,
    }),
    profiles[0],
  );
}

function dedupePosts(posts: XPost[]): XPost[] {
  const seen = new Set<string>();
  const deduped: XPost[] = [];
  for (const post of posts) {
    const key = `${post.id ?? ""}\n${post.permalink ?? ""}\n${post.text ?? ""}`;
    if (!key.trim() || seen.has(key)) continue;
    seen.add(key);
    deduped.push({ ...post, position: deduped.length + 1 });
  }
  return deduped;
}

function flattenJsonLd(value: unknown): unknown[] {
  if (Array.isArray(value)) return value.flatMap(flattenJsonLd);
  if (!isRecord(value)) return [];
  const graph = value["@graph"];
  return [value, ...(Array.isArray(graph) ? graph.flatMap(flattenJsonLd) : [])];
}

function mediaValues(value: unknown, pageUrl: string): string[] {
  return collectRecords(value)
    .filter((record) => record.media_url_https || record.media_url || record.video_info)
    .flatMap((record) =>
      [record.media_url_https, record.media_url].flatMap((item) => imageValues(item, pageUrl)),
    );
}

function imageValues(value: unknown, baseUrl: string): string[] {
  if (typeof value === "string") {
    return [normalizeExternalUrl(value, baseUrl)].filter(isString);
  }
  if (Array.isArray(value)) return value.flatMap((item) => imageValues(item, baseUrl));
  if (isRecord(value)) return imageValues(value.url ?? value.contentUrl, baseUrl);
  return [];
}

function entityHashtags(value: unknown): string[] {
  return collectRecords(isRecord(value) ? value.hashtags : value)
    .map((record) => stringValue(record.text))
    .filter(isString);
}

function entityMentions(value: unknown): string[] {
  return collectRecords(isRecord(value) ? value.user_mentions : value)
    .map((record) => stringValue(record.screen_name))
    .filter(isString);
}

function entityUrls(value: unknown): string[] {
  return collectRecords(isRecord(value) ? value.urls : value)
    .map((record) => stringValue(record.expanded_url) ?? stringValue(record.url))
    .filter(isString);
}

function expandedUrlFromEntities(value: unknown): string | null {
  return entityUrls(value)[0] ?? null;
}

function postIdFromUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.match(/\/status\/(\d+)/i)?.[1] ?? value.match(/\/i\/web\/status\/(\d+)/i)?.[1] ?? null;
}

function handleFromProfileUrl(value: string): string | null {
  try {
    const url = new URL(value);
    const first = url.pathname.split("/").filter(Boolean)[0];
    if (!first || ["search", "i", "home", "explore", "settings"].includes(first.toLowerCase())) {
      return null;
    }
    return cleanHandle(first);
  } catch {
    return null;
  }
}

function parseLabeledMetric(value: string, label: string): number | null {
  const match = value.match(new RegExp(`([\\d,.]+)\\s*([KMB])?\\s+${label}`, "i"));
  return match ? parseNumber(`${match[1]}${match[2] ?? ""}`) : null;
}

function countValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") return parseNumber(value);
  return null;
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
  const plain = value.match(/-?\b\d[\d,.]*\b/);
  if (!plain) return null;
  const number = Number.parseFloat(plain[0].replace(/,/g, ""));
  return Number.isFinite(number) ? Math.round(number) : null;
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
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
    return normalizeText(value) || null;
  }
  return null;
}

function extractHashtags(value: string | null): string[] {
  if (!value) return [];
  return [...new Set([...value.matchAll(/#([A-Za-z0-9_]+)/g)].map((match) => match[1]))];
}

function extractMentions(value: string | null): string[] {
  if (!value) return [];
  return [...new Set([...value.matchAll(/@([A-Za-z0-9_]+)/g)].map((match) => match[1]))];
}

function extractUrls(value: string | null): string[] {
  if (!value) return [];
  return [...new Set([...value.matchAll(/https?:\/\/[^\s]+/g)].map((match) => match[0]))];
}

function meta($: CheerioAPI, property: string): string | null {
  return (
    normalizeText(
      $(`meta[property='${property}'], meta[name='${property}']`).first().attr("content") ??
        "",
    ) || null
  );
}

function parseInputUrl(input: string): URL | null {
  if (!/^https?:\/\//i.test(input) && !/^(?:www\.)?(?:x|twitter)\.com\//i.test(input)) {
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

function isXUrl(url: URL): boolean {
  return /(^|\.)(x|twitter)\.com$/i.test(url.hostname);
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
    return new URL(value, baseUrl || "https://x.com/").href;
  } catch {
    return null;
  }
}

function cleanHandle(value: string | null | undefined): string | null {
  if (!value) return null;
  const cleaned = value.replace(/^@/, "").trim();
  if (!/^[A-Za-z0-9_]{1,15}$/.test(cleaned)) return null;
  return cleaned;
}

function looksBlocked(html: string): boolean {
  return /captcha|login|sign in to x|something went wrong|account suspended|this post is unavailable|rate limit/i.test(
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

function booleanValue(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value.toLowerCase() === "true") return true;
    if (value.toLowerCase() === "false") return false;
  }
  return null;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => normalizeText(value)).filter(Boolean))];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isProfile(value: XProfile | null): value is XProfile {
  return Boolean(value);
}

function isPost(value: XPost | null): value is XPost {
  return Boolean(value?.id || value?.text || value?.permalink);
}

function errorRecord(
  request: TargetRequest,
  error: string,
  statusCode: number | null,
): XProfilePostsError {
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
