import { WEBSITE_CONTENT_CRAWLER_METADATA } from "@/tools/website-content-crawler/metadata";
import { WEBSITE_LOGO_EXTRACTOR_METADATA } from "@/tools/website-logo-extractor/metadata";
import { SITEMAP_URL_EXTRACTOR_METADATA } from "@/tools/sitemap-url-extractor/metadata";
import { RSS_FEED_READER_METADATA } from "@/tools/rss-feed-reader/metadata";
import { GOOGLE_SEARCH_RESULTS_METADATA } from "@/tools/google-search-results/metadata";
import { GOOGLE_MAPS_PLACES_METADATA } from "@/tools/google-maps-places/metadata";
import { AMAZON_PRODUCT_DETAILS_METADATA } from "@/tools/amazon-product-details/metadata";
import { YOUTUBE_VIDEO_DETAILS_METADATA } from "@/tools/youtube-video-details/metadata";
import { REDDIT_POSTS_COMMENTS_METADATA } from "@/tools/reddit-posts-comments/metadata";
import { INSTAGRAM_PROFILE_POSTS_METADATA } from "@/tools/instagram-profile-posts/metadata";
import { TIKTOK_PROFILE_VIDEOS_METADATA } from "@/tools/tiktok-profile-videos/metadata";
import { META_ADS_LIBRARY_METADATA } from "@/tools/meta-ads-library/metadata";

export const MCP_TOOLS = [
  {
    name: "fetch_url",
    title: "Fetch URL",
    desc:
      "Fetch a URL with Better Fetch's auto strategy: direct HTTP for simple body reads, Chromium when rendering/browser features are needed. Returns body text or HTML plus status, final URL, block, cache, and transport metadata.",
  },
  {
    name: "scrape_json",
    title: "Scrape JSON API",
    desc:
      "Fetch a JSON endpoint with browser-compatible headers and session reuse when needed, returning parsed JSON, fallback body_text, and response metadata.",
  },
  {
    name: "screenshot_url",
    title: "Screenshot URL",
    desc:
      "Render a page and capture a viewport or full-page PNG screenshot.",
  },
  {
    name: "discover_apis",
    title: "Discover APIs",
    desc:
      "Load a page and capture the XHR/fetch calls it makes, with optional response previews and streamed values, to find internal APIs behind the page.",
  },
  {
    name: "get_clearance",
    title: "Get Cloudflare clearance",
    desc:
      "Attempt a Cloudflare challenge flow and return cf_clearance cookie metadata when the browser receives it, plus the reusable Better Fetch session.",
  },
  {
    name: "get_datadome_cookie",
    title: "Get DataDome cookie",
    desc:
      "Render a DataDome-protected page and return datadome cookie metadata when the browser receives it, plus the reusable Better Fetch session.",
  },
  {
    name: "get_usage",
    title: "Get plan usage",
    desc:
      "Check the connected Better Fetch account: plan, calls used this billing period, remaining quota, stored browser sessions, and reset time.",
  },
  {
    name: "list_sessions",
    title: "List browser sessions",
    desc:
      "List active account-scoped browser sessions without exposing cookies, localStorage, or snapshot object paths.",
  },
  {
    name: "clear_session",
    title: "Clear browser session",
    desc:
      "Clear a stored browser session through the backend, delete its portable snapshot, and make future requests with that session name start from a fresh profile key.",
  },
  {
    name: WEBSITE_CONTENT_CRAWLER_METADATA.mcpName,
    title: WEBSITE_CONTENT_CRAWLER_METADATA.title,
    desc: WEBSITE_CONTENT_CRAWLER_METADATA.description,
  },
  {
    name: WEBSITE_LOGO_EXTRACTOR_METADATA.mcpName,
    title: WEBSITE_LOGO_EXTRACTOR_METADATA.title,
    desc: WEBSITE_LOGO_EXTRACTOR_METADATA.description,
  },
  {
    name: SITEMAP_URL_EXTRACTOR_METADATA.mcpName,
    title: SITEMAP_URL_EXTRACTOR_METADATA.title,
    desc: SITEMAP_URL_EXTRACTOR_METADATA.description,
  },
  {
    name: RSS_FEED_READER_METADATA.mcpName,
    title: RSS_FEED_READER_METADATA.title,
    desc: RSS_FEED_READER_METADATA.description,
  },
  {
    name: GOOGLE_SEARCH_RESULTS_METADATA.mcpName,
    title: GOOGLE_SEARCH_RESULTS_METADATA.title,
    desc: GOOGLE_SEARCH_RESULTS_METADATA.description,
  },
  {
    name: GOOGLE_MAPS_PLACES_METADATA.mcpName,
    title: GOOGLE_MAPS_PLACES_METADATA.title,
    desc: GOOGLE_MAPS_PLACES_METADATA.description,
  },
  {
    name: AMAZON_PRODUCT_DETAILS_METADATA.mcpName,
    title: AMAZON_PRODUCT_DETAILS_METADATA.title,
    desc: AMAZON_PRODUCT_DETAILS_METADATA.description,
  },
  {
    name: YOUTUBE_VIDEO_DETAILS_METADATA.mcpName,
    title: YOUTUBE_VIDEO_DETAILS_METADATA.title,
    desc: YOUTUBE_VIDEO_DETAILS_METADATA.description,
  },
  {
    name: REDDIT_POSTS_COMMENTS_METADATA.mcpName,
    title: REDDIT_POSTS_COMMENTS_METADATA.title,
    desc: REDDIT_POSTS_COMMENTS_METADATA.description,
  },
  {
    name: INSTAGRAM_PROFILE_POSTS_METADATA.mcpName,
    title: INSTAGRAM_PROFILE_POSTS_METADATA.title,
    desc: INSTAGRAM_PROFILE_POSTS_METADATA.description,
  },
  {
    name: TIKTOK_PROFILE_VIDEOS_METADATA.mcpName,
    title: TIKTOK_PROFILE_VIDEOS_METADATA.title,
    desc: TIKTOK_PROFILE_VIDEOS_METADATA.description,
  },
  {
    name: META_ADS_LIBRARY_METADATA.mcpName,
    title: META_ADS_LIBRARY_METADATA.title,
    desc: META_ADS_LIBRARY_METADATA.description,
  },
] as const;

export type McpToolName = (typeof MCP_TOOLS)[number]["name"];

export const MCP_TOOL_DESCRIPTIONS = Object.fromEntries(
  MCP_TOOLS.map((tool) => [tool.name, tool.desc]),
) as Record<McpToolName, string>;
