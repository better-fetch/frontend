import * as cheerio from "cheerio";
import { z } from "zod";

const VIDEO_INPUT = z.string().trim().min(1).max(2_048);
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

export const YOUTUBE_VIDEO_DETAILS_INPUT_SCHEMA = z.object({
  videos: z.array(VIDEO_INPUT).min(1).max(100),
  countryCode: COUNTRY_CODE.default("us"),
  languageCode: LANGUAGE_CODE.default("en"),
  strategy: z.enum(["auto", "http", "browser"]).default("browser"),
  timeoutSecs: z.number().int().min(5).max(180).default(60),
});

export const YOUTUBE_VIDEO_DETAILS_MCP_INPUT_SCHEMA = {
  videos: z
    .array(VIDEO_INPUT)
    .min(1)
    .max(100)
    .describe("YouTube watch, shorts, embed, youtu.be URLs, or 11-character video IDs"),
  countryCode: COUNTRY_CODE.optional().describe("Two-letter country code (default us)"),
  languageCode: LANGUAGE_CODE.optional().describe("Language code like en or en-US (default en)"),
  strategy: z
    .enum(["auto", "http", "browser"])
    .optional()
    .describe("Better Fetch strategy for each video page (default browser)"),
  timeoutSecs: z
    .number()
    .int()
    .min(5)
    .max(180)
    .optional()
    .describe("Per-video timeout in seconds (default 60)"),
};

export type YoutubeVideoDetailsInput = z.input<typeof YOUTUBE_VIDEO_DETAILS_INPUT_SCHEMA>;
export type YoutubeVideoDetailsOptions = z.output<typeof YOUTUBE_VIDEO_DETAILS_INPUT_SCHEMA>;

export type YoutubeVideoDetailsFetchRequest = {
  url: string;
  timeoutSecs: number;
  strategy: "auto" | "http" | "browser";
  countryCode: string;
  languageCode: string;
};

export type YoutubeVideoDetailsFetchResult = {
  ok?: boolean;
  error?: string;
  message?: string;
  status?: number;
  final_url?: string;
  html?: string | null;
  body_text?: string | null;
  title?: string | null;
};

export type YoutubeVideoDetailsFetch = (
  request: YoutubeVideoDetailsFetchRequest,
) => Promise<YoutubeVideoDetailsFetchResult>;

export type YoutubeThumbnail = {
  url: string;
  width: number | null;
  height: number | null;
};

export type YoutubeVideoDetails = {
  videoId: string;
  title: string;
  url: string;
  canonicalUrl: string | null;
  channelName: string | null;
  channelId: string | null;
  channelUrl: string | null;
  description: string | null;
  durationSeconds: number | null;
  viewCount: number | null;
  likeCount: number | null;
  commentCount: number | null;
  publishDate: string | null;
  uploadDate: string | null;
  category: string | null;
  keywords: string[];
  thumbnailUrl: string | null;
  thumbnails: YoutubeThumbnail[];
  isLiveContent: boolean | null;
  isShort: boolean;
};

export type YoutubeVideoDetailsRecord = {
  input: string;
  inputIndex: number;
  url: string;
  finalUrl: string;
  statusCode: number | null;
  video: YoutubeVideoDetails;
};

export type YoutubeVideoDetailsError = {
  input: string;
  inputIndex: number;
  url: string | null;
  error: string;
  statusCode: number | null;
};

type VideoRequest = {
  source: string;
  inputIndex: number;
  videoId: string;
  url: string;
};

export async function scrapeYoutubeVideoDetails(
  input: YoutubeVideoDetailsInput,
  fetchVideoPage: YoutubeVideoDetailsFetch,
) {
  const options = YOUTUBE_VIDEO_DETAILS_INPUT_SCHEMA.parse(input);
  const results: YoutubeVideoDetailsRecord[] = [];
  const errors: YoutubeVideoDetailsError[] = [];

  for (const [index, source] of options.videos.entries()) {
    let request: VideoRequest;
    try {
      request = buildVideoRequest(source, index + 1, options);
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

    let response: YoutubeVideoDetailsFetchResult;
    try {
      response = await fetchVideoPage({
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
      errors.push(errorRecord(request, "youtube page appears blocked", response.status ?? null));
      continue;
    }

    const finalUrl = normalizeUrl(response.final_url ?? request.url);
    const video = parseYoutubeVideo(html, finalUrl, request.videoId);
    if (!video) {
      errors.push(
        errorRecord(
          request,
          "video page did not contain video details",
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
      video,
    });
  }

  return {
    ok: errors.length === 0,
    tool: "youtube_video_details",
    video_count: results.length,
    item_count: results.length,
    results,
    errors,
  };
}

function buildVideoRequest(
  source: string,
  inputIndex: number,
  options: YoutubeVideoDetailsOptions,
): VideoRequest {
  const raw = source.trim();
  const videoId = videoIdFromInput(raw);
  if (!videoId) {
    throw new Error("Input must be a YouTube video URL or 11-character video ID");
  }

  const url = new URL("https://www.youtube.com/watch");
  url.searchParams.set("v", videoId);
  url.searchParams.set("hl", options.languageCode);
  url.searchParams.set("gl", options.countryCode.toUpperCase());
  return { source: raw, inputIndex, videoId, url: url.href };
}

function parseYoutubeVideo(
  html: string,
  pageUrl: string,
  fallbackVideoId: string,
): YoutubeVideoDetails | null {
  const $ = cheerio.load(html);
  const player = extractJsonAssignment(html, "ytInitialPlayerResponse") ?? {};
  const initialData = extractJsonAssignment(html, "ytInitialData") ?? {};
  const videoDetails = isRecord(player.videoDetails) ? player.videoDetails : {};
  const microformat = isRecord(player.microformat) && isRecord(player.microformat.playerMicroformatRenderer)
    ? player.microformat.playerMicroformatRenderer
    : {};
  const videoId = stringValue(videoDetails.videoId) ?? videoIdFromInput(pageUrl) ?? fallbackVideoId;
  const title =
    stringValue(videoDetails.title) ??
    attr($, "meta[property='og:title']", "content") ??
    attr($, "meta[name='title']", "content") ??
    "";

  if (!videoId || !title) return null;

  const thumbnails = uniqueThumbnails([
    ...thumbnailArray(videoDetails.thumbnail),
    ...thumbnailArray(microformat.thumbnail),
    thumbnailFromUrl(attr($, "meta[property='og:image']", "content")),
  ]);
  const textHaystack = collectStrings(initialData).join("\n");
  const canonicalUrl = attr($, "link[rel='canonical']", "href") ??
    attr($, "meta[property='og:url']", "content") ??
    `https://www.youtube.com/watch?v=${videoId}`;
  const channelId =
    stringValue(videoDetails.channelId) ??
    stringValue(microformat.externalChannelId) ??
    channelIdFromUrl(stringValue(microformat.ownerProfileUrl)) ??
    null;
  const channelUrl =
    normalizeExternalUrl(stringValue(microformat.ownerProfileUrl), pageUrl) ??
    (channelId ? `https://www.youtube.com/channel/${channelId}` : null);

  return {
    videoId,
    title: cleanTitle(title),
    url: `https://www.youtube.com/watch?v=${videoId}`,
    canonicalUrl: normalizeExternalUrl(canonicalUrl, pageUrl),
    channelName:
      stringValue(videoDetails.author) ??
      stringValue(microformat.ownerChannelName) ??
      attr($, "span[itemprop='author'] link[itemprop='name']", "content") ??
      null,
    channelId,
    channelUrl,
    description:
      stringValue(videoDetails.shortDescription) ??
      simpleText(microformat.description) ??
      attr($, "meta[property='og:description']", "content") ??
      attr($, "meta[name='description']", "content"),
    durationSeconds:
      numberValue(videoDetails.lengthSeconds) ??
      numberValue(microformat.lengthSeconds) ??
      durationFromText(attr($, "meta[itemprop='duration']", "content") ?? ""),
    viewCount:
      numberValue(videoDetails.viewCount) ??
      numberValue(microformat.viewCount) ??
      numberFromText(attr($, "meta[itemprop='interactionCount']", "content") ?? "") ??
      parseCount(textHaystack, /(views?|watching)/i),
    likeCount: parseCount(textHaystack || html, /likes?/i),
    commentCount: parseCount(textHaystack || html, /comments?/i),
    publishDate: stringValue(microformat.publishDate),
    uploadDate:
      stringValue(microformat.uploadDate) ??
      attr($, "meta[itemprop='uploadDate']", "content"),
    category: stringValue(microformat.category),
    keywords: unique([
      ...stringArray(videoDetails.keywords),
      ...splitKeywords(attr($, "meta[name='keywords']", "content")),
    ]),
    thumbnailUrl: thumbnails[0]?.url ?? null,
    thumbnails,
    isLiveContent: booleanValue(videoDetails.isLiveContent),
    isShort: /\/shorts\//i.test(pageUrl) || textHaystack.includes("SHORTS"),
  };
}

function videoIdFromInput(value: string): string | null {
  if (/^[a-zA-Z0-9_-]{11}$/.test(value)) return value;
  const inputUrl = parseInputUrl(value);
  if (!inputUrl || !isYoutubeUrl(inputUrl)) return null;

  const watchId = inputUrl.searchParams.get("v");
  if (watchId && /^[a-zA-Z0-9_-]{11}$/.test(watchId)) return watchId;

  const pathParts = inputUrl.pathname.split("/").filter(Boolean);
  const shortHost = inputUrl.hostname.replace(/^www\./, "").toLowerCase() === "youtu.be";
  if (shortHost && pathParts[0] && /^[a-zA-Z0-9_-]{11}$/.test(pathParts[0])) {
    return pathParts[0];
  }

  const idFromPath = pathParts.find((part, index) =>
    ["shorts", "embed", "live"].includes(pathParts[index - 1] ?? "") &&
    /^[a-zA-Z0-9_-]{11}$/.test(part),
  );
  return idFromPath ?? null;
}

function extractJsonAssignment(html: string, variableName: string): Record<string, unknown> | null {
  const marker = new RegExp(`${variableName}\\s*=\\s*`);
  const match = marker.exec(html);
  if (!match) return null;
  const start = html.indexOf("{", match.index + match[0].length);
  if (start === -1) return null;
  const raw = balancedJsonObject(html, start);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function balancedJsonObject(input: string, start: number): string | null {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < input.length; index += 1) {
    const char = input[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) return input.slice(start, index + 1);
    }
  }
  return null;
}

function collectStrings(value: unknown, output: string[] = []): string[] {
  if (typeof value === "string") {
    if (value.trim()) output.push(value.trim());
    return output;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, output);
    return output;
  }
  if (isRecord(value)) {
    for (const item of Object.values(value)) collectStrings(item, output);
  }
  return output;
}

function parseCount(text: string, labelPattern: RegExp): number | null {
  const chunks = text.split(/\n+/).map((chunk) => chunk.trim()).filter(Boolean);
  for (const chunk of chunks) {
    if (!labelPattern.test(chunk)) continue;
    const number = numberFromText(chunk);
    if (number !== null) return number;
  }
  return null;
}

function numberFromText(value: string): number | null {
  const compact = value.match(/\b([\d,.]+)\s*([KMB])\b/i);
  if (compact) {
    const base = Number.parseFloat(compact[1].replace(/,/g, ""));
    const multiplier = { K: 1_000, M: 1_000_000, B: 1_000_000_000 }[
      compact[2].toUpperCase() as "K" | "M" | "B"
    ];
    return Number.isFinite(base) ? Math.round(base * multiplier) : null;
  }

  const plain = value.match(/\b([\d][\d,]*)\b/);
  if (!plain) return null;
  const number = Number.parseInt(plain[1].replace(/,/g, ""), 10);
  return Number.isFinite(number) ? number : null;
}

function durationFromText(value: string): number | null {
  const match = value.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i);
  if (!match) return null;
  const hours = Number.parseInt(match[1] ?? "0", 10);
  const minutes = Number.parseInt(match[2] ?? "0", 10);
  const seconds = Number.parseInt(match[3] ?? "0", 10);
  return hours * 3600 + minutes * 60 + seconds;
}

function thumbnailArray(value: unknown): YoutubeThumbnail[] {
  if (!isRecord(value) || !Array.isArray(value.thumbnails)) return [];
  return value.thumbnails
    .map((item): YoutubeThumbnail | null => {
      if (!isRecord(item) || typeof item.url !== "string") return null;
      return {
        url: item.url,
        width: numberValue(item.width),
        height: numberValue(item.height),
      };
    })
    .filter((item): item is YoutubeThumbnail => Boolean(item));
}

function thumbnailFromUrl(url: string | null): YoutubeThumbnail | null {
  return url ? { url, width: null, height: null } : null;
}

function uniqueThumbnails(values: (YoutubeThumbnail | null)[]): YoutubeThumbnail[] {
  const seen = new Set<string>();
  const thumbnails: YoutubeThumbnail[] = [];
  for (const value of values) {
    if (!value?.url || seen.has(value.url)) continue;
    seen.add(value.url);
    thumbnails.push(value);
  }
  return thumbnails;
}

function splitKeywords(value: string | null): string[] {
  return value
    ? value.split(",").map((keyword) => keyword.trim()).filter(Boolean)
    : [];
}

function simpleText(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (!isRecord(value)) return null;
  if (typeof value.simpleText === "string") return value.simpleText.trim() || null;
  if (Array.isArray(value.runs)) {
    const text = value.runs
      .map((run) => (isRecord(run) && typeof run.text === "string" ? run.text : ""))
      .join("");
    return text.trim() || null;
  }
  return null;
}

function attr($: cheerio.CheerioAPI, selector: string, name: string): string | null {
  return normalizeText($(selector).first().attr(name) ?? "") || null;
}

function cleanTitle(value: string): string {
  return value.replace(/\s*-\s*YouTube$/i, "").trim();
}

function channelIdFromUrl(value: string | null): string | null {
  if (!value) return null;
  const match = value.match(/\/channel\/([a-zA-Z0-9_-]+)/);
  return match?.[1] ?? null;
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

function isYoutubeUrl(url: URL) {
  const hostname = url.hostname.replace(/^www\./, "").toLowerCase();
  return hostname === "youtube.com" || hostname.endsWith(".youtube.com") || hostname === "youtu.be";
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
  return /unusual traffic|detected unusual traffic|captcha|consent\.youtube|sorry\/index/i.test(html);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
    : [];
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const number = Number.parseInt(String(value).replace(/,/g, ""), 10);
  return Number.isFinite(number) ? number : null;
}

function booleanValue(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function errorRecord(
  request: VideoRequest,
  error: string,
  statusCode: number | null,
): YoutubeVideoDetailsError {
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
