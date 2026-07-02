import * as cheerio from "cheerio";
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

export const INSTAGRAM_PROFILE_POSTS_INPUT_SCHEMA = z.object({
  targets: z.array(TARGET_INPUT).min(1).max(100),
  maxPostsPerTarget: z.number().int().min(1).max(500).default(24),
  countryCode: COUNTRY_CODE.default("us"),
  languageCode: LANGUAGE_CODE.default("en"),
  strategy: z.enum(["auto", "http", "browser"]).default("browser"),
  timeoutSecs: z.number().int().min(5).max(180).default(60),
});

export const INSTAGRAM_PROFILE_POSTS_MCP_INPUT_SCHEMA = {
  targets: z
    .array(TARGET_INPUT)
    .min(1)
    .max(100)
    .describe("Instagram usernames, profile URLs, post/reel URLs, or hashtag inputs"),
  maxPostsPerTarget: z
    .number()
    .int()
    .min(1)
    .max(500)
    .optional()
    .describe("Maximum posts returned for each target (default 24)"),
  countryCode: COUNTRY_CODE.optional().describe("Two-letter country code (default us)"),
  languageCode: LANGUAGE_CODE.optional().describe("Language code like en or en-US (default en)"),
  strategy: z
    .enum(["auto", "http", "browser"])
    .optional()
    .describe("Better Fetch strategy for each Instagram page (default browser)"),
  timeoutSecs: z
    .number()
    .int()
    .min(5)
    .max(180)
    .optional()
    .describe("Per-target timeout in seconds (default 60)"),
};

export type InstagramProfilePostsInput = z.input<
  typeof INSTAGRAM_PROFILE_POSTS_INPUT_SCHEMA
>;
export type InstagramProfilePostsOptions = z.output<
  typeof INSTAGRAM_PROFILE_POSTS_INPUT_SCHEMA
>;

export type InstagramProfilePostsFetchRequest = {
  url: string;
  timeoutSecs: number;
  strategy: "auto" | "http" | "browser";
  countryCode: string;
  languageCode: string;
};

export type InstagramProfilePostsFetchResult = {
  ok?: boolean;
  error?: string;
  message?: string;
  status?: number;
  final_url?: string;
  html?: string | null;
  body_text?: string | null;
  title?: string | null;
};

export type InstagramProfilePostsFetch = (
  request: InstagramProfilePostsFetchRequest,
) => Promise<InstagramProfilePostsFetchResult>;

export type InstagramProfile = {
  username: string | null;
  fullName: string | null;
  biography: string | null;
  followerCount: number | null;
  followingCount: number | null;
  postCount: number | null;
  externalUrl: string | null;
  profileImageUrl: string | null;
  isVerified: boolean | null;
  isPrivate: boolean | null;
};

export type InstagramPost = {
  position: number;
  id: string | null;
  shortcode: string | null;
  type: "IMAGE" | "VIDEO" | "CAROUSEL" | "REEL" | "UNKNOWN";
  caption: string | null;
  authorUsername: string | null;
  authorFullName: string | null;
  timestamp: string | null;
  likeCount: number | null;
  commentCount: number | null;
  viewCount: number | null;
  videoDurationSeconds: number | null;
  displayUrl: string | null;
  mediaUrls: string[];
  permalink: string | null;
  hashtags: string[];
  mentions: string[];
  locationName: string | null;
  isSponsored: boolean | null;
};

export type InstagramProfilePostsRecord = {
  target: {
    input: string;
    inputIndex: number;
    url: string;
    finalUrl: string;
    type: "PROFILE" | "POST" | "HASHTAG";
    countryCode: string;
    languageCode: string;
  };
  profile: InstagramProfile | null;
  posts: InstagramPost[];
};

export type InstagramProfilePostsError = {
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
  type: "PROFILE" | "POST" | "HASHTAG";
};

type PostSeed = {
  id?: unknown;
  shortcode?: unknown;
  code?: unknown;
  url?: unknown;
  permalink?: unknown;
  typename?: unknown;
  __typename?: unknown;
  product_type?: unknown;
  media_type?: unknown;
  is_video?: unknown;
  video_url?: unknown;
  video_view_count?: unknown;
  video_play_count?: unknown;
  video_duration?: unknown;
  taken_at_timestamp?: unknown;
  taken_at?: unknown;
  datePublished?: unknown;
  caption?: unknown;
  edge_media_to_caption?: unknown;
  edge_liked_by?: unknown;
  edge_media_preview_like?: unknown;
  like_count?: unknown;
  likes?: unknown;
  edge_media_to_comment?: unknown;
  comment_count?: unknown;
  comments?: unknown;
  display_url?: unknown;
  thumbnail_src?: unknown;
  image?: unknown;
  media_url?: unknown;
  media?: unknown;
  edge_sidecar_to_children?: unknown;
  owner?: unknown;
  user?: unknown;
  location?: unknown;
  is_paid_partnership?: unknown;
  is_ad?: unknown;
};

export async function scrapeInstagramProfilePosts(
  input: InstagramProfilePostsInput,
  fetchInstagramPage: InstagramProfilePostsFetch,
) {
  const options = INSTAGRAM_PROFILE_POSTS_INPUT_SCHEMA.parse(input);
  const results: InstagramProfilePostsRecord[] = [];
  const errors: InstagramProfilePostsError[] = [];

  for (const [index, target] of options.targets.entries()) {
    let request: TargetRequest;
    try {
      request = buildTargetRequest(target, index + 1, options.languageCode);
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

    let response: InstagramProfilePostsFetchResult;
    try {
      response = await fetchInstagramPage({
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
    const parsed = parseInstagramPage(html, finalUrl, request.type, options);

    if (looksBlocked(html) && !parsed.profile && parsed.posts.length === 0) {
      errors.push(
        errorRecord(
          request,
          "instagram page appears blocked, private, or unavailable",
          response.status ?? null,
        ),
      );
      continue;
    }

    if (!parsed.profile && parsed.posts.length === 0) {
      errors.push(
        errorRecord(
          request,
          "instagram page did not contain profile or post data",
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
    tool: "instagram_profile_posts",
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
  languageCode: string,
): TargetRequest {
  const raw = target.trim();
  const inputUrl = parseInputUrl(raw);
  if (inputUrl) {
    if (!isInstagramUrl(inputUrl)) {
      throw new Error(
        "Input must be an Instagram profile/post/reel/hashtag URL, username, or hashtag",
      );
    }
    const normalized = normalizeInstagramUrl(inputUrl, languageCode);
    return {
      input: raw,
      inputIndex,
      url: normalized.url,
      type: normalized.type,
    };
  }

  const hashtag = raw.match(/^#?([A-Za-z0-9_][A-Za-z0-9_.]{0,139})$/)?.[1];
  if (raw.startsWith("#") && hashtag) {
    const url = new URL(`https://www.instagram.com/explore/tags/${hashtag}/`);
    url.searchParams.set("hl", languageCode);
    return { input: raw, inputIndex, url: url.href, type: "HASHTAG" };
  }

  const username = raw.match(/^[A-Za-z0-9._]{1,30}$/)?.[0];
  if (username) {
    const url = new URL(`https://www.instagram.com/${username}/`);
    url.searchParams.set("hl", languageCode);
    return { input: raw, inputIndex, url: url.href, type: "PROFILE" };
  }

  throw new Error(
    "Input must be an Instagram profile/post/reel/hashtag URL, username, or hashtag",
  );
}

function normalizeInstagramUrl(
  inputUrl: URL,
  languageCode: string,
): { url: string; type: TargetRequest["type"] } {
  const pathParts = inputUrl.pathname.split("/").filter(Boolean);
  const first = pathParts[0]?.toLowerCase();
  const second = pathParts[1];
  const url = new URL("https://www.instagram.com/");
  url.searchParams.set("hl", languageCode);

  if ((first === "p" || first === "reel" || first === "tv") && second) {
    url.pathname = `/${first}/${second}/`;
    return { url: url.href, type: "POST" };
  }

  if (first === "explore" && pathParts[1]?.toLowerCase() === "tags" && pathParts[2]) {
    url.pathname = `/explore/tags/${pathParts[2]}/`;
    return { url: url.href, type: "HASHTAG" };
  }

  if (first && /^[A-Za-z0-9._]{1,30}$/.test(first)) {
    url.pathname = `/${first}/`;
    return { url: url.href, type: "PROFILE" };
  }

  throw new Error(
    "Input must be an Instagram profile/post/reel/hashtag URL, username, or hashtag",
  );
}

function parseInstagramPage(
  html: string,
  pageUrl: string,
  targetType: TargetRequest["type"],
  options: InstagramProfilePostsOptions,
) {
  const $ = cheerio.load(html);
  const embedded = extractEmbeddedJson($, html);
  const profile = mergeProfile(
    [
      ...embedded.map(profileFromJson).filter(isProfile),
      profileFromMeta($),
      profileFromDom($),
    ].filter(isProfile),
  );
  const posts = dedupePosts([
    ...embedded.flatMap((value) => postsFromJson(value, pageUrl, targetType)),
    ...postsFromJsonLd($, pageUrl, targetType),
    ...postsFromDom($, pageUrl, targetType),
  ]).slice(0, options.maxPostsPerTarget);
  return { profile, posts };
}

function profileFromMeta($: cheerio.CheerioAPI): InstagramProfile | null {
  const title = meta($, "og:title") ?? $("title").first().text();
  const description = meta($, "og:description") ?? "";
  const image = meta($, "og:image");
  const titleMatch = title.match(/(.+?)\s+\(@([^)]+)\)/);
  const simpleTitle = title.match(/^@?([A-Za-z0-9._]{1,30})/);
  const metricText = decodeHtml(description);
  const followers = metricText.match(/([\d,.]+)\s*([KMB])?\s+Followers/i);
  const following = metricText.match(/([\d,.]+)\s*([KMB])?\s+Following/i);
  const posts = metricText.match(/([\d,.]+)\s*([KMB])?\s+Posts/i);
  const username = titleMatch?.[2] ?? simpleTitle?.[1] ?? null;
  const fullName = titleMatch?.[1]?.trim() ?? null;
  if (!username && !fullName && !description && !image) return null;
  return {
    username,
    fullName,
    biography: bioFromDescription(metricText, username),
    followerCount: followers ? parseNumber(`${followers[1]}${followers[2] ?? ""}`) : null,
    followingCount: following
      ? parseNumber(`${following[1]}${following[2] ?? ""}`)
      : null,
    postCount: posts ? parseNumber(`${posts[1]}${posts[2] ?? ""}`) : null,
    externalUrl: null,
    profileImageUrl: image,
    isVerified: null,
    isPrivate: null,
  };
}

function profileFromDom($: cheerio.CheerioAPI): InstagramProfile | null {
  const title = normalizeText($("h1").first().text()) || null;
  const username = normalizeText($("header a[href^='/']").first().text()) || null;
  if (!title && !username) return null;
  return {
    username: cleanUsername(username),
    fullName: title,
    biography: normalizeText($("header section div").last().text()) || null,
    followerCount: parseNumber($("a[href$='/followers/']").first().text()),
    followingCount: parseNumber($("a[href$='/following/']").first().text()),
    postCount: parseNumber($("header li").first().text()),
    externalUrl: normalizeExternalUrl($("header a[href^='http']").first().attr("href"), ""),
    profileImageUrl: normalizeExternalUrl($("header img[src]").first().attr("src"), ""),
    isVerified: null,
    isPrivate: null,
  };
}

function profileFromJson(value: unknown): InstagramProfile | null {
  const candidates = collectRecords(value).filter(isProfileCandidate);
  for (const candidate of candidates) {
    const username = cleanUsername(
      stringValue(candidate.username) ??
        stringValue(candidate.handle) ??
        stringValue(candidate.alternateName),
    );
    const fullName =
      stringValue(candidate.full_name) ??
      stringValue(candidate.fullName) ??
      stringValue(candidate.name);
    const biography =
      stringValue(candidate.biography) ??
      stringValue(candidate.bio) ??
      stringValue(candidate.description);
    const profile: InstagramProfile = {
      username,
      fullName,
      biography,
      followerCount:
        countValue(candidate.edge_followed_by) ??
        countValue(candidate.followed_by) ??
        countValue(candidate.followers) ??
        numberValue(candidate.follower_count) ??
        numberValue(candidate.followersCount),
      followingCount:
        countValue(candidate.edge_follow) ??
        countValue(candidate.following) ??
        numberValue(candidate.following_count) ??
        numberValue(candidate.followsCount),
      postCount:
        countValue(candidate.edge_owner_to_timeline_media) ??
        countValue(candidate.media) ??
        numberValue(candidate.media_count) ??
        numberValue(candidate.postsCount),
      externalUrl:
        stringValue(candidate.external_url) ??
        stringValue(candidate.externalUrl) ??
        stringValue(candidate.url),
      profileImageUrl:
        stringValue(candidate.profile_pic_url_hd) ??
        stringValue(candidate.profile_pic_url) ??
        stringValue(candidate.profilePictureUrl) ??
        stringValue(candidate.image),
      isVerified:
        booleanValue(candidate.is_verified) ?? booleanValue(candidate.verified) ?? null,
      isPrivate: booleanValue(candidate.is_private) ?? booleanValue(candidate.private) ?? null,
    };
    if (profile.username || profile.fullName || profile.biography) return profile;
  }
  return null;
}

function postsFromJson(
  value: unknown,
  pageUrl: string,
  targetType: TargetRequest["type"],
): InstagramPost[] {
  return collectRecords(value)
    .filter(isPostCandidate)
    .map((record, index) => postFromSeed(record as PostSeed, pageUrl, targetType, index + 1))
    .filter(isPost);
}

function postsFromJsonLd(
  $: cheerio.CheerioAPI,
  pageUrl: string,
  targetType: TargetRequest["type"],
): InstagramPost[] {
  const posts: InstagramPost[] = [];
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
      if (
        !types.some(
          (value) => typeof value === "string" && /socialmediaposting|imageobject|videoobject/i.test(value),
        )
      ) {
        continue;
      }
      posts.push(
        postFromSeed(
          {
            shortcode: shortcodeFromUrl(stringValue(item.url) ?? pageUrl),
            url: item.url,
            caption: item.caption ?? item.text ?? item.description,
            owner: item.author,
            datePublished: item.datePublished,
            display_url: item.image,
            media_url: item.contentUrl,
            media_type: String(type).toLowerCase().includes("video") ? "video" : "image",
            video_duration: item.duration,
            like_count: item.interactionStatistic,
          },
          pageUrl,
          targetType,
          posts.length + 1,
        ),
      );
    }
  });
  return posts.filter(isPost);
}

function postsFromDom(
  $: cheerio.CheerioAPI,
  pageUrl: string,
  targetType: TargetRequest["type"],
): InstagramPost[] {
  const posts: InstagramPost[] = [];
  $("article a[href*='/p/'], article a[href*='/reel/'], a[href*='/p/'], a[href*='/reel/']").each(
    (_, element) => {
      const node = $(element);
      const permalink = normalizeExternalUrl(node.attr("href"), pageUrl);
      const shortcode = shortcodeFromUrl(permalink);
      if (!shortcode) return;
      const image = normalizeExternalUrl(node.find("img[src]").first().attr("src"), pageUrl);
      const caption = node.find("img[alt]").first().attr("alt") ?? null;
      posts.push({
        position: posts.length + 1,
        id: shortcode,
        shortcode,
        type: permalink?.includes("/reel/") ? "REEL" : targetType === "POST" ? "UNKNOWN" : "IMAGE",
        caption,
        authorUsername: null,
        authorFullName: null,
        timestamp: null,
        likeCount: null,
        commentCount: null,
        viewCount: null,
        videoDurationSeconds: null,
        displayUrl: image,
        mediaUrls: image ? [image] : [],
        permalink,
        hashtags: extractHashtags(caption),
        mentions: extractMentions(caption),
        locationName: null,
        isSponsored: null,
      });
    },
  );
  return posts;
}

function postFromSeed(
  seed: PostSeed,
  pageUrl: string,
  targetType: TargetRequest["type"],
  position: number,
): InstagramPost {
  const shortcode =
    stringValue(seed.shortcode) ??
    stringValue(seed.code) ??
    shortcodeFromUrl(stringValue(seed.url) ?? stringValue(seed.permalink));
  const permalink = normalizeExternalUrl(
    stringValue(seed.url) ??
      stringValue(seed.permalink) ??
      (shortcode
        ? `https://www.instagram.com/${isReelSeed(seed, pageUrl) ? "reel" : "p"}/${shortcode}/`
        : null),
    pageUrl,
  );
  const caption = captionText(seed.caption ?? seed.edge_media_to_caption);
  const owner = isRecord(seed.owner) ? seed.owner : isRecord(seed.user) ? seed.user : null;
  const mediaUrls = mediaUrlValues(seed, pageUrl);
  const displayUrl =
    normalizeExternalUrl(stringValue(seed.display_url) ?? stringValue(seed.thumbnail_src), pageUrl) ??
    mediaUrls[0] ??
    null;
  const timestamp =
    timestampValue(seed.taken_at_timestamp) ??
    timestampValue(seed.taken_at) ??
    stringValue(seed.datePublished);

  return {
    position,
    id: stringValue(seed.id) ?? shortcode,
    shortcode,
    type: mediaType(seed, permalink, targetType),
    caption,
    authorUsername: cleanUsername(owner ? stringValue(owner.username) : null),
    authorFullName: owner
      ? stringValue(owner.full_name) ?? stringValue(owner.fullName) ?? stringValue(owner.name)
      : null,
    timestamp,
    likeCount:
      countValue(seed.edge_liked_by) ??
      countValue(seed.edge_media_preview_like) ??
      countValue(seed.likes) ??
      numberValue(seed.like_count),
    commentCount:
      countValue(seed.edge_media_to_comment) ??
      countValue(seed.comments) ??
      numberValue(seed.comment_count),
    viewCount: numberValue(seed.video_view_count) ?? numberValue(seed.video_play_count),
    videoDurationSeconds: durationValue(seed.video_duration),
    displayUrl,
    mediaUrls,
    permalink,
    hashtags: extractHashtags(caption),
    mentions: extractMentions(caption),
    locationName: locationName(seed.location),
    isSponsored:
      booleanValue(seed.is_paid_partnership) ?? booleanValue(seed.is_ad) ?? null,
  };
}

function mediaUrlValues(seed: PostSeed, pageUrl: string): string[] {
  const direct = [
    seed.display_url,
    seed.thumbnail_src,
    seed.video_url,
    seed.media_url,
    seed.image,
  ].flatMap((value) => imageValues(value, pageUrl));
  const nested = [
    seed.media,
    seed.edge_sidecar_to_children,
  ].flatMap((value) =>
    collectRecords(value).flatMap((record) =>
      [
        record.display_url,
        record.thumbnail_src,
        record.video_url,
        record.media_url,
        record.url,
      ].flatMap((item) => imageValues(item, pageUrl)),
    ),
  );
  return [...new Set([...direct, ...nested])];
}

function mediaType(
  seed: PostSeed,
  permalink: string | null,
  targetType: TargetRequest["type"],
): InstagramPost["type"] {
  const typeText = [
    stringValue(seed.__typename),
    stringValue(seed.typename),
    stringValue(seed.product_type),
    stringValue(seed.media_type),
    permalink,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (typeText.includes("reel")) return "REEL";
  if (typeText.includes("sidecar") || typeText.includes("carousel")) return "CAROUSEL";
  if (typeText.includes("video") || booleanValue(seed.is_video)) return "VIDEO";
  if (typeText.includes("image") || typeText.includes("photo")) return "IMAGE";
  if (targetType === "POST") return "UNKNOWN";
  return "UNKNOWN";
}

function isReelSeed(seed: PostSeed, pageUrl: string): boolean {
  return mediaType(seed, pageUrl, "POST") === "REEL";
}

function isPostCandidate(record: Record<string, unknown>): boolean {
  if (record.shortcode || record.code) return true;
  const url = stringValue(record.url) ?? stringValue(record.permalink);
  if (url && /instagram\.com\/(?:p|reel|tv)\//i.test(url)) return true;
  if (record.node && isRecord(record.node)) return isPostCandidate(record.node);
  return false;
}

function isProfileCandidate(record: Record<string, unknown>): boolean {
  if (
    record.username &&
    (record.biography ||
      record.full_name ||
      record.edge_followed_by ||
      record.edge_owner_to_timeline_media ||
      record.profile_pic_url ||
      record.profile_pic_url_hd)
  ) {
    return true;
  }
  const graphql = record.graphql;
  if (isRecord(graphql) && isRecord(graphql.user)) return true;
  const user = record.user;
  if (isRecord(user) && user.username) return true;
  return false;
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
    if (isRecord(item.node)) visit(item.node);
    if (isRecord(item.graphql)) visit(item.graphql);
    const graphql = item.graphql;
    if (isRecord(graphql) && isRecord(graphql.user)) visit(graphql.user);
    records.push(item);
    for (const child of Object.values(item)) {
      if (Array.isArray(child) || isRecord(child)) visit(child);
    }
  }

  visit(value);
  return records;
}

function extractEmbeddedJson($: cheerio.CheerioAPI, html: string): unknown[] {
  const values: unknown[] = [];
  $("script[type='application/json'], script#__NEXT_DATA__").each(
    (_, element) => {
      const text = $(element).text().trim();
      if (!text) return;
      try {
        values.push(JSON.parse(text));
      } catch {
        // Ignore non-JSON scripts.
      }
    },
  );

  for (const expression of [
    /window\._sharedData\s*=\s*/g,
    /window\.__additionalDataLoaded\s*\([^,]+,\s*/g,
  ]) {
    let match: RegExpExecArray | null;
    while ((match = expression.exec(html))) {
      const raw = balancedJsonObject(html, match.index + match[0].length);
      if (!raw) continue;
      try {
        values.push(JSON.parse(raw));
      } catch {
        // Ignore malformed embedded state.
      }
    }
  }

  return values;
}

function balancedJsonObject(source: string, start: number): string | null {
  const first = source.slice(start).search(/[{[]/);
  if (first < 0) return null;
  const absoluteStart = start + first;
  const opening = source[absoluteStart];
  const closing = opening === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = absoluteStart; index < source.length; index += 1) {
    const char = source[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }
    if (char === "\"") {
      inString = true;
      continue;
    }
    if (char === opening) depth += 1;
    if (char === closing) depth -= 1;
    if (depth === 0) return source.slice(absoluteStart, index + 1);
  }
  return null;
}

function mergeProfile(profiles: InstagramProfile[]): InstagramProfile | null {
  if (profiles.length === 0) return null;
  return profiles.reduce<InstagramProfile>(
    (merged, profile) => ({
      username: merged.username ?? profile.username,
      fullName: merged.fullName ?? profile.fullName,
      biography: merged.biography ?? profile.biography,
      followerCount: merged.followerCount ?? profile.followerCount,
      followingCount: merged.followingCount ?? profile.followingCount,
      postCount: merged.postCount ?? profile.postCount,
      externalUrl: merged.externalUrl ?? profile.externalUrl,
      profileImageUrl: merged.profileImageUrl ?? profile.profileImageUrl,
      isVerified: merged.isVerified ?? profile.isVerified,
      isPrivate: merged.isPrivate ?? profile.isPrivate,
    }),
    profiles[0],
  );
}

function dedupePosts(posts: InstagramPost[]): InstagramPost[] {
  const seen = new Set<string>();
  const deduped: InstagramPost[] = [];
  for (const post of posts) {
    const key = `${post.shortcode ?? ""}\n${post.permalink ?? ""}\n${post.id ?? ""}`;
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

function imageValues(value: unknown, baseUrl: string): string[] {
  if (typeof value === "string") {
    return [normalizeExternalUrl(value, baseUrl)].filter(isString);
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => imageValues(item, baseUrl));
  }
  if (isRecord(value)) {
    return imageValues(value.url ?? value.contentUrl, baseUrl);
  }
  return [];
}

function captionText(value: unknown): string | null {
  if (typeof value === "string") return normalizeText(value) || null;
  if (isRecord(value)) {
    if (typeof value.text === "string") return normalizeText(value.text) || null;
    const edges = value.edges;
    if (Array.isArray(edges)) {
      for (const edge of edges) {
        if (isRecord(edge) && isRecord(edge.node) && typeof edge.node.text === "string") {
          return normalizeText(edge.node.text) || null;
        }
      }
    }
  }
  return null;
}

function locationName(value: unknown): string | null {
  if (typeof value === "string") return normalizeText(value) || null;
  if (isRecord(value)) {
    return stringValue(value.name) ?? stringValue(value.title);
  }
  return null;
}

function timestampValue(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value * 1000).toISOString();
  }
  if (typeof value === "string") {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) {
      return new Date(numeric * 1000).toISOString();
    }
    return normalizeText(value) || null;
  }
  return null;
}

function durationValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const match = value.match(/PT(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?/i);
    if (match) {
      return (Number(match[1] ?? 0) * 60) + Number(match[2] ?? 0);
    }
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }
  return null;
}

function countValue(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") return parseNumber(value);
  if (isRecord(value)) {
    return (
      numberValue(value.count) ??
      numberValue(value.total_count) ??
      numberValue(value.value) ??
      parseNumber(stringValue(value.name) ?? "")
    );
  }
  if (Array.isArray(value)) return value.length;
  return null;
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") return parseNumber(value);
  if (Array.isArray(value)) return value.length;
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

function booleanValue(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value.toLowerCase() === "true") return true;
    if (value.toLowerCase() === "false") return false;
  }
  return null;
}

function meta($: cheerio.CheerioAPI, property: string): string | null {
  return (
    normalizeText(
      $(`meta[property='${property}'], meta[name='${property}']`).first().attr("content") ??
        "",
    ) || null
  );
}

function bioFromDescription(description: string, username: string | null): string | null {
  const withoutPrefix = description.replace(
    /^[\d,.]+\s*[KMB]?\s+Followers,\s+[\d,.]+\s*[KMB]?\s+Following,\s+[\d,.]+\s*[KMB]?\s+Posts\s+-\s+/i,
    "",
  );
  const cleaned = username
    ? withoutPrefix.replace(new RegExp(`\\s*\\(@${escapeRegex(username)}\\).*`, "i"), "")
    : withoutPrefix;
  return normalizeText(cleaned.replace(/^See Instagram photos and videos from\s+/i, "")) || null;
}

function shortcodeFromUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.match(/\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/i)?.[1] ?? null;
}

function cleanUsername(value: string | null | undefined): string | null {
  return value?.replace(/^@/, "").trim() || null;
}

function extractHashtags(value: string | null): string[] {
  if (!value) return [];
  return [...new Set([...value.matchAll(/#([A-Za-z0-9_]+)/g)].map((match) => match[1]))];
}

function extractMentions(value: string | null): string[] {
  if (!value) return [];
  return [...new Set([...value.matchAll(/@([A-Za-z0-9._]+)/g)].map((match) => match[1]))];
}

function parseInputUrl(input: string): URL | null {
  if (!/^https?:\/\//i.test(input) && !/^(?:www\.)?instagram\.com\//i.test(input)) {
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

function isInstagramUrl(url: URL): boolean {
  return /(^|\.)instagram\.com$/i.test(url.hostname);
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
    return new URL(value, baseUrl || "https://www.instagram.com/").href;
  } catch {
    return null;
  }
}

function looksBlocked(html: string): boolean {
  return /login_required|please wait a few minutes|checkpoint|captcha|not available|page isn't available|this account is private/i.test(
    html,
  );
}

function decodeHtml(value: string): string {
  return cheerio.load(`<div>${value}</div>`)("div").text();
}

function normalizeText(value: string): string {
  return decodeHtml(value).replace(/\s+/g, " ").trim();
}

function stringValue(value: unknown): string | null {
  if (typeof value === "string") return normalizeText(value) || null;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (isRecord(value)) return stringValue(value.name ?? value.text ?? value.url);
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isProfile(value: InstagramProfile | null): value is InstagramProfile {
  return Boolean(value);
}

function isPost(value: InstagramPost | null): value is InstagramPost {
  return Boolean(value?.shortcode || value?.permalink || value?.id);
}

function errorRecord(
  request: TargetRequest,
  error: string,
  statusCode: number | null,
): InstagramProfilePostsError {
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

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
