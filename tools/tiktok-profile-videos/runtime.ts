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

export const TIKTOK_PROFILE_VIDEOS_INPUT_SCHEMA = z.object({
  targets: z.array(TARGET_INPUT).min(1).max(100),
  maxVideosPerTarget: z.number().int().min(1).max(500).default(24),
  countryCode: COUNTRY_CODE.default("us"),
  languageCode: LANGUAGE_CODE.default("en"),
  strategy: z.enum(["auto", "http", "browser"]).default("browser"),
  timeoutSecs: z.number().int().min(5).max(180).default(60),
});

export const TIKTOK_PROFILE_VIDEOS_MCP_INPUT_SCHEMA = {
  targets: z
    .array(TARGET_INPUT)
    .min(1)
    .max(100)
    .describe("TikTok usernames, profile URLs, video URLs, hashtag URLs, or search phrases"),
  maxVideosPerTarget: z
    .number()
    .int()
    .min(1)
    .max(500)
    .optional()
    .describe("Maximum videos returned for each target (default 24)"),
  countryCode: COUNTRY_CODE.optional().describe("Two-letter country code (default us)"),
  languageCode: LANGUAGE_CODE.optional().describe("Language code like en or en-US (default en)"),
  strategy: z
    .enum(["auto", "http", "browser"])
    .optional()
    .describe("Better Fetch strategy for each TikTok page (default browser)"),
  timeoutSecs: z
    .number()
    .int()
    .min(5)
    .max(180)
    .optional()
    .describe("Per-target timeout in seconds (default 60)"),
};

export type TiktokProfileVideosInput = z.input<typeof TIKTOK_PROFILE_VIDEOS_INPUT_SCHEMA>;
export type TiktokProfileVideosOptions = z.output<typeof TIKTOK_PROFILE_VIDEOS_INPUT_SCHEMA>;

export type TiktokProfileVideosFetchRequest = {
  url: string;
  timeoutSecs: number;
  strategy: "auto" | "http" | "browser";
  countryCode: string;
  languageCode: string;
};

export type TiktokProfileVideosFetchResult = {
  ok?: boolean;
  error?: string;
  message?: string;
  status?: number;
  final_url?: string;
  html?: string | null;
  body_text?: string | null;
  title?: string | null;
};

export type TiktokProfileVideosFetch = (
  request: TiktokProfileVideosFetchRequest,
) => Promise<TiktokProfileVideosFetchResult>;

export type TiktokProfile = {
  username: string | null;
  displayName: string | null;
  bio: string | null;
  followerCount: number | null;
  followingCount: number | null;
  heartCount: number | null;
  videoCount: number | null;
  isVerified: boolean | null;
  avatarUrl: string | null;
  profileUrl: string | null;
};

export type TiktokVideo = {
  position: number;
  id: string | null;
  description: string | null;
  authorUsername: string | null;
  authorDisplayName: string | null;
  timestamp: string | null;
  durationSeconds: number | null;
  likeCount: number | null;
  commentCount: number | null;
  shareCount: number | null;
  viewCount: number | null;
  saveCount: number | null;
  coverUrl: string | null;
  playUrl: string | null;
  mediaUrls: string[];
  permalink: string | null;
  hashtags: string[];
  mentions: string[];
  musicTitle: string | null;
  musicAuthor: string | null;
  musicOriginal: boolean | null;
};

export type TiktokProfileVideosRecord = {
  target: {
    input: string;
    inputIndex: number;
    url: string;
    finalUrl: string;
    type: "PROFILE" | "VIDEO" | "HASHTAG" | "SEARCH";
    countryCode: string;
    languageCode: string;
  };
  profile: TiktokProfile | null;
  videos: TiktokVideo[];
};

export type TiktokProfileVideosError = {
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
  type: "PROFILE" | "VIDEO" | "HASHTAG" | "SEARCH";
};

type VideoSeed = {
  id?: unknown;
  desc?: unknown;
  description?: unknown;
  text?: unknown;
  createTime?: unknown;
  create_time?: unknown;
  datePublished?: unknown;
  author?: unknown;
  authorStats?: unknown;
  stats?: unknown;
  statsV2?: unknown;
  video?: unknown;
  music?: unknown;
  challenges?: unknown;
  textExtra?: unknown;
  url?: unknown;
  permalink?: unknown;
  cover?: unknown;
  image?: unknown;
  contentUrl?: unknown;
  duration?: unknown;
};

export async function scrapeTiktokProfileVideos(
  input: TiktokProfileVideosInput,
  fetchTiktokPage: TiktokProfileVideosFetch,
) {
  const options = TIKTOK_PROFILE_VIDEOS_INPUT_SCHEMA.parse(input);
  const results: TiktokProfileVideosRecord[] = [];
  const errors: TiktokProfileVideosError[] = [];

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

    let response: TiktokProfileVideosFetchResult;
    try {
      response = await fetchTiktokPage({
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
    const parsed = parseTiktokPage(html, finalUrl, request.type, options);

    if (looksBlocked(html) && !parsed.profile && parsed.videos.length === 0) {
      errors.push(
        errorRecord(
          request,
          "tiktok page appears blocked, unavailable, or login-gated",
          response.status ?? null,
        ),
      );
      continue;
    }

    if (!parsed.profile && parsed.videos.length === 0) {
      errors.push(
        errorRecord(
          request,
          "tiktok page did not contain profile or video data",
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
      videos: parsed.videos.slice(0, options.maxVideosPerTarget),
    });
  }

  const profileCount = results.filter((result) => result.profile).length;
  const videoCount = results.reduce((total, result) => total + result.videos.length, 0);
  return {
    ok: errors.length === 0,
    tool: "tiktok_profile_videos",
    target_count: results.length,
    profile_count: profileCount,
    video_count: videoCount,
    item_count: profileCount + videoCount,
    results,
    errors,
  };
}

function buildTargetRequest(
  target: string,
  inputIndex: number,
  options: TiktokProfileVideosOptions,
): TargetRequest {
  const raw = target.trim();
  const inputUrl = parseInputUrl(raw);
  if (inputUrl) {
    if (!isTiktokUrl(inputUrl)) {
      throw new Error(
        "Input must be a TikTok username, profile URL, video URL, hashtag URL, or search phrase",
      );
    }
    const normalized = normalizeTiktokUrl(inputUrl, options.languageCode);
    return { input: raw, inputIndex, url: normalized.url, type: normalized.type };
  }

  const hashtag = raw.match(/^#([A-Za-z0-9_][A-Za-z0-9_.-]{0,139})$/)?.[1];
  if (hashtag) {
    const url = new URL(`https://www.tiktok.com/tag/${hashtag}`);
    url.searchParams.set("lang", options.languageCode);
    return { input: raw, inputIndex, url: url.href, type: "HASHTAG" };
  }

  const username = raw.match(/^@?([A-Za-z0-9._]{2,24})$/)?.[1];
  if (username && !raw.includes(" ")) {
    const url = new URL(`https://www.tiktok.com/@${username}`);
    url.searchParams.set("lang", options.languageCode);
    return { input: raw, inputIndex, url: url.href, type: "PROFILE" };
  }

  const url = new URL("https://www.tiktok.com/search");
  url.searchParams.set("q", raw);
  url.searchParams.set("lang", options.languageCode);
  return { input: raw, inputIndex, url: url.href, type: "SEARCH" };
}

function normalizeTiktokUrl(
  inputUrl: URL,
  languageCode: string,
): { url: string; type: TargetRequest["type"] } {
  const pathParts = inputUrl.pathname.split("/").filter(Boolean);
  const first = pathParts[0] ?? "";
  const second = pathParts[1] ?? "";
  const url = new URL("https://www.tiktok.com/");
  url.searchParams.set("lang", languageCode);

  if (first.startsWith("@") && second === "video" && pathParts[2]) {
    url.pathname = `/${first}/video/${pathParts[2]}`;
    return { url: url.href, type: "VIDEO" };
  }
  if (first.startsWith("@")) {
    url.pathname = `/${first}`;
    return { url: url.href, type: "PROFILE" };
  }
  if (first.toLowerCase() === "tag" && second) {
    url.pathname = `/tag/${second}`;
    return { url: url.href, type: "HASHTAG" };
  }
  if (first.toLowerCase() === "search") {
    url.pathname = "/search";
    const query = inputUrl.searchParams.get("q");
    if (query) url.searchParams.set("q", query);
    return { url: url.href, type: "SEARCH" };
  }
  if (first.toLowerCase() === "t" && second) {
    url.pathname = `/t/${second}`;
    return { url: url.href, type: "VIDEO" };
  }

  throw new Error(
    "Input must be a TikTok username, profile URL, video URL, hashtag URL, or search phrase",
  );
}

function parseTiktokPage(
  html: string,
  pageUrl: string,
  targetType: TargetRequest["type"],
  options: TiktokProfileVideosOptions,
) {
  const $ = cheerio.load(html);
  const embedded = extractEmbeddedJson($);
  const profile = mergeProfiles(
    [
      ...embedded.map(profileFromJson).filter(isProfile),
      profileFromMeta($, pageUrl),
      profileFromDom($, pageUrl),
    ].filter(isProfile),
  );
  const videos = dedupeVideos([
    ...embedded.flatMap((value) => videosFromJson(value, pageUrl)),
    ...videosFromJsonLd($, pageUrl),
    ...videosFromDom($, pageUrl, targetType),
  ]).slice(0, options.maxVideosPerTarget);
  return { profile, videos };
}

function profileFromMeta($: cheerio.CheerioAPI, pageUrl: string): TiktokProfile | null {
  const title = meta($, "og:title") ?? $("title").first().text();
  const description = meta($, "og:description") ?? meta($, "description");
  const image = meta($, "og:image");
  const username =
    cleanUsername(pageUrl.match(/tiktok\.com\/@([^/?#]+)/i)?.[1]) ??
    cleanUsername(title.match(/@([A-Za-z0-9._]{2,24})/)?.[1]);
  const displayName = normalizeText(title.replace(/\|.*$/g, "").replace(/TikTok.*$/i, "")) || null;
  if (!username && !displayName && !description && !image) return null;
  return {
    username,
    displayName,
    bio: description,
    followerCount: parseLabeledMetric(description ?? "", "Followers"),
    followingCount: parseLabeledMetric(description ?? "", "Following"),
    heartCount:
      parseLabeledMetric(description ?? "", "Likes") ??
      parseLabeledMetric(description ?? "", "Hearts"),
    videoCount: parseLabeledMetric(description ?? "", "Videos"),
    isVerified: null,
    avatarUrl: image,
    profileUrl: username ? `https://www.tiktok.com/@${username}` : null,
  };
}

function profileFromDom($: cheerio.CheerioAPI, pageUrl: string): TiktokProfile | null {
  const username =
    cleanUsername($("[data-e2e='user-title']").first().text()) ??
    cleanUsername(pageUrl.match(/tiktok\.com\/@([^/?#]+)/i)?.[1]);
  const displayName = normalizeText($("[data-e2e='user-subtitle'], h1").first().text()) || null;
  if (!username && !displayName) return null;
  return {
    username,
    displayName,
    bio: normalizeText($("[data-e2e='user-bio']").first().text()) || null,
    followerCount: parseNumber($("[data-e2e='followers-count']").first().text()),
    followingCount: parseNumber($("[data-e2e='following-count']").first().text()),
    heartCount: parseNumber($("[data-e2e='likes-count']").first().text()),
    videoCount: null,
    isVerified: null,
    avatarUrl: normalizeExternalUrl($("img[src*='avatar']").first().attr("src"), pageUrl),
    profileUrl: username ? `https://www.tiktok.com/@${username}` : null,
  };
}

function profileFromJson(value: unknown): TiktokProfile | null {
  const records = collectRecords(value);
  const userStats = findUserStats(value);
  for (const record of records) {
    if (!isUserCandidate(record)) continue;
    const username =
      cleanUsername(
        stringValue(record.uniqueId) ??
          stringValue(record.unique_id) ??
          stringValue(record.username) ??
          stringValue(record.secUid),
      ) ?? null;
    const stats =
      userStats.get(username ?? "") ??
      (isRecord(record.stats) ? record.stats : null) ??
      (isRecord(record.statsV2) ? record.statsV2 : null);
    const profile: TiktokProfile = {
      username,
      displayName:
        stringValue(record.nickname) ??
        stringValue(record.displayName) ??
        stringValue(record.name),
      bio:
        stringValue(record.signature) ??
        stringValue(record.bio) ??
        stringValue(record.description),
      followerCount:
        countValue(stats?.followerCount) ??
        countValue(record.followerCount) ??
        countValue(record.followers),
      followingCount:
        countValue(stats?.followingCount) ??
        countValue(record.followingCount) ??
        countValue(record.following),
      heartCount:
        countValue(stats?.heart) ??
        countValue(stats?.heartCount) ??
        countValue(record.heartCount) ??
        countValue(record.likes),
      videoCount:
        countValue(stats?.videoCount) ??
        countValue(record.videoCount) ??
        countValue(record.videos),
      isVerified: booleanValue(record.verified) ?? booleanValue(record.isVerified) ?? null,
      avatarUrl:
        stringValue(record.avatarLarger) ??
        stringValue(record.avatarMedium) ??
        stringValue(record.avatarThumb) ??
        stringValue(record.avatarUrl) ??
        imageValues(record.image, "https://www.tiktok.com/")[0] ??
        null,
      profileUrl: username ? `https://www.tiktok.com/@${username}` : stringValue(record.url),
    };
    if (profile.username || profile.displayName || profile.bio) return profile;
  }
  return null;
}

function videosFromJson(value: unknown, pageUrl: string): TiktokVideo[] {
  return collectRecords(value)
    .filter(isVideoCandidate)
    .map((record, index) => videoFromSeed(record as VideoSeed, pageUrl, index + 1))
    .filter(isVideo);
}

function videosFromJsonLd($: cheerio.CheerioAPI, pageUrl: string): TiktokVideo[] {
  const videos: TiktokVideo[] = [];
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
      if (!types.some((value) => typeof value === "string" && /videoobject|socialmediaposting/i.test(value))) {
        continue;
      }
      videos.push(
        videoFromSeed(
          {
            id: videoIdFromUrl(stringValue(item.url) ?? pageUrl),
            url: item.url,
            desc: item.description ?? item.caption ?? item.name,
            author: item.author,
            datePublished: item.datePublished ?? item.uploadDate,
            image: item.thumbnailUrl ?? item.image,
            contentUrl: item.contentUrl,
            duration: item.duration,
          },
          pageUrl,
          videos.length + 1,
        ),
      );
    }
  });
  return videos.filter(isVideo);
}

function videosFromDom(
  $: cheerio.CheerioAPI,
  pageUrl: string,
  targetType: TargetRequest["type"],
): TiktokVideo[] {
  const videos: TiktokVideo[] = [];
  $("a[href*='/video/']").each((_, element) => {
    const node = $(element);
    const permalink = normalizeExternalUrl(node.attr("href"), pageUrl);
    const id = videoIdFromUrl(permalink);
    if (!id) return;
    const image = normalizeExternalUrl(node.find("img[src]").first().attr("src"), pageUrl);
    const description = node.find("img[alt]").first().attr("alt") ?? null;
    videos.push({
      position: videos.length + 1,
      id,
      description,
      authorUsername: cleanUsername(permalink?.match(/tiktok\.com\/@([^/]+)/i)?.[1]),
      authorDisplayName: null,
      timestamp: null,
      durationSeconds: null,
      likeCount: null,
      commentCount: null,
      shareCount: null,
      viewCount: null,
      saveCount: null,
      coverUrl: image,
      playUrl: null,
      mediaUrls: image ? [image] : [],
      permalink,
      hashtags: extractHashtags(description),
      mentions: extractMentions(description),
      musicTitle: null,
      musicAuthor: null,
      musicOriginal: null,
    });
  });
  if (targetType === "VIDEO" && videos.length > 0) return videos.slice(0, 1);
  return videos;
}

function videoFromSeed(seed: VideoSeed, pageUrl: string, position: number): TiktokVideo {
  const id =
    stringValue(seed.id) ??
    videoIdFromUrl(stringValue(seed.url) ?? stringValue(seed.permalink) ?? pageUrl);
  const author = isRecord(seed.author) ? seed.author : null;
  const stats = isRecord(seed.stats) ? seed.stats : isRecord(seed.statsV2) ? seed.statsV2 : null;
  const video = isRecord(seed.video) ? seed.video : null;
  const music = isRecord(seed.music) ? seed.music : null;
  const authorUsername = cleanUsername(
    stringValue(author?.uniqueId) ??
      stringValue(author?.username) ??
      stringValue(author?.unique_id) ??
      pageUrl.match(/tiktok\.com\/@([^/]+)/i)?.[1],
  );
  const permalink = normalizeExternalUrl(
    stringValue(seed.url) ??
      stringValue(seed.permalink) ??
      (id && authorUsername ? `https://www.tiktok.com/@${authorUsername}/video/${id}` : null),
    pageUrl,
  );
  const description =
    stringValue(seed.desc) ?? stringValue(seed.description) ?? stringValue(seed.text);
  const cover =
    stringValue(video?.cover) ??
    stringValue(video?.originCover) ??
    stringValue(video?.dynamicCover) ??
    stringValue(seed.cover) ??
    imageValues(seed.image, pageUrl)[0] ??
    null;
  const play =
    stringValue(video?.playAddr) ??
    stringValue(video?.downloadAddr) ??
    stringValue(seed.contentUrl);
  const mediaUrls = [...new Set([cover, play].filter(isString))];

  return {
    position,
    id,
    description,
    authorUsername,
    authorDisplayName:
      stringValue(author?.nickname) ?? stringValue(author?.displayName) ?? stringValue(author?.name),
    timestamp:
      timestampValue(seed.createTime) ??
      timestampValue(seed.create_time) ??
      stringValue(seed.datePublished),
    durationSeconds: durationValue(video?.duration ?? seed.duration),
    likeCount: countValue(stats?.diggCount) ?? countValue(stats?.likeCount),
    commentCount: countValue(stats?.commentCount),
    shareCount: countValue(stats?.shareCount),
    viewCount: countValue(stats?.playCount) ?? countValue(stats?.viewCount),
    saveCount: countValue(stats?.collectCount) ?? countValue(stats?.saveCount),
    coverUrl: cover,
    playUrl: play,
    mediaUrls,
    permalink,
    hashtags: extractSeedHashtags(seed, description),
    mentions: extractSeedMentions(seed, description),
    musicTitle: stringValue(music?.title) ?? stringValue(music?.musicName),
    musicAuthor: stringValue(music?.authorName) ?? stringValue(music?.author),
    musicOriginal: booleanValue(music?.original) ?? null,
  };
}

function findUserStats(value: unknown): Map<string, Record<string, unknown>> {
  const stats = new Map<string, Record<string, unknown>>();
  if (!isRecord(value)) return stats;
  const userModule = value.UserModule;
  if (!isRecord(userModule) || !isRecord(userModule.stats)) return stats;
  for (const [key, record] of Object.entries(userModule.stats)) {
    if (isRecord(record)) stats.set(key, record);
  }
  return stats;
}

function extractEmbeddedJson($: cheerio.CheerioAPI): unknown[] {
  const values: unknown[] = [];
  $("script[type='application/json'], script#__NEXT_DATA__, script#SIGI_STATE, script#__UNIVERSAL_DATA_FOR_REHYDRATION__").each(
    (_, element) => {
      const text = $(element).text().trim();
      if (!text) return;
      try {
        values.push(JSON.parse(text));
      } catch {
        // Ignore non-JSON script payloads.
      }
    },
  );
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

function isUserCandidate(record: Record<string, unknown>): boolean {
  return Boolean(
    record.uniqueId ||
      record.unique_id ||
      record.username ||
      record.nickname ||
      record.signature ||
      record.avatarLarger,
  );
}

function isVideoCandidate(record: Record<string, unknown>): boolean {
  if (record.id && (record.desc || record.video || record.stats || record.music)) return true;
  const url = stringValue(record.url) ?? stringValue(record.permalink);
  return Boolean(url && /tiktok\.com\/@[^/]+\/video\/\d+/i.test(url));
}

function mergeProfiles(profiles: TiktokProfile[]): TiktokProfile | null {
  if (profiles.length === 0) return null;
  return profiles.reduce<TiktokProfile>(
    (merged, profile) => ({
      username: merged.username ?? profile.username,
      displayName: merged.displayName ?? profile.displayName,
      bio: merged.bio ?? profile.bio,
      followerCount: merged.followerCount ?? profile.followerCount,
      followingCount: merged.followingCount ?? profile.followingCount,
      heartCount: merged.heartCount ?? profile.heartCount,
      videoCount: merged.videoCount ?? profile.videoCount,
      isVerified: merged.isVerified ?? profile.isVerified,
      avatarUrl: merged.avatarUrl ?? profile.avatarUrl,
      profileUrl: merged.profileUrl ?? profile.profileUrl,
    }),
    profiles[0],
  );
}

function dedupeVideos(videos: TiktokVideo[]): TiktokVideo[] {
  const seen = new Set<string>();
  const deduped: TiktokVideo[] = [];
  for (const video of videos) {
    const key = `${video.id ?? ""}\n${video.permalink ?? ""}`;
    if (!key.trim() || seen.has(key)) continue;
    seen.add(key);
    deduped.push({ ...video, position: deduped.length + 1 });
  }
  return deduped;
}

function flattenJsonLd(value: unknown): unknown[] {
  if (Array.isArray(value)) return value.flatMap(flattenJsonLd);
  if (!isRecord(value)) return [];
  const graph = value["@graph"];
  return [value, ...(Array.isArray(graph) ? graph.flatMap(flattenJsonLd) : [])];
}

function extractSeedHashtags(seed: VideoSeed, text: string | null): string[] {
  const values = [
    ...extractHashtags(text),
    ...collectRecords(seed.challenges)
      .map((record) => stringValue(record.title) ?? stringValue(record.name))
      .filter(isString),
    ...collectRecords(seed.textExtra)
      .map((record) => stringValue(record.hashtagName))
      .filter(isString),
  ];
  return [...new Set(values.map((value) => value.replace(/^#/, "")))];
}

function extractSeedMentions(seed: VideoSeed, text: string | null): string[] {
  const values = [
    ...extractMentions(text),
    ...collectRecords(seed.textExtra)
      .map((record) => stringValue(record.userUniqueId) ?? stringValue(record.userId))
      .filter(isString),
  ];
  return [...new Set(values.map((value) => value.replace(/^@/, "")))];
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

function videoIdFromUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.match(/\/video\/(\d+)/i)?.[1] ?? null;
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
    const iso = value.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?/i);
    if (iso) {
      return Number(iso[1] ?? 0) * 3600 + Number(iso[2] ?? 0) * 60 + Number(iso[3] ?? 0);
    }
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }
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

function extractHashtags(value: string | null): string[] {
  if (!value) return [];
  return [...new Set([...value.matchAll(/#([A-Za-z0-9_]+)/g)].map((match) => match[1]))];
}

function extractMentions(value: string | null): string[] {
  if (!value) return [];
  return [...new Set([...value.matchAll(/@([A-Za-z0-9._]+)/g)].map((match) => match[1]))];
}

function meta($: cheerio.CheerioAPI, property: string): string | null {
  return (
    normalizeText(
      $(`meta[property='${property}'], meta[name='${property}']`).first().attr("content") ??
        "",
    ) || null
  );
}

function parseInputUrl(input: string): URL | null {
  if (!/^https?:\/\//i.test(input) && !/^(?:www\.)?tiktok\.com\//i.test(input)) {
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

function isTiktokUrl(url: URL): boolean {
  return /(^|\.)tiktok\.com$/i.test(url.hostname);
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
    return new URL(value, baseUrl || "https://www.tiktok.com/").href;
  } catch {
    return null;
  }
}

function cleanUsername(value: string | null | undefined): string | null {
  return value?.replace(/^@/, "").trim() || null;
}

function looksBlocked(html: string): boolean {
  return /captcha|verify to continue|access denied|login required|couldn't find this account|video currently unavailable|not available/i.test(
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isProfile(value: TiktokProfile | null): value is TiktokProfile {
  return Boolean(value);
}

function isVideo(value: TiktokVideo | null): value is TiktokVideo {
  return Boolean(value?.id || value?.permalink);
}

function errorRecord(
  request: TargetRequest,
  error: string,
  statusCode: number | null,
): TiktokProfileVideosError {
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
