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
import { X_PROFILE_POSTS_METADATA } from "@/tools/x-profile-posts/metadata";

export const MARKETPLACE_TOOLS = [
  WEBSITE_CONTENT_CRAWLER_METADATA,
  WEBSITE_LOGO_EXTRACTOR_METADATA,
  SITEMAP_URL_EXTRACTOR_METADATA,
  RSS_FEED_READER_METADATA,
  GOOGLE_SEARCH_RESULTS_METADATA,
  GOOGLE_MAPS_PLACES_METADATA,
  AMAZON_PRODUCT_DETAILS_METADATA,
  YOUTUBE_VIDEO_DETAILS_METADATA,
  REDDIT_POSTS_COMMENTS_METADATA,
  INSTAGRAM_PROFILE_POSTS_METADATA,
  TIKTOK_PROFILE_VIDEOS_METADATA,
  META_ADS_LIBRARY_METADATA,
  X_PROFILE_POSTS_METADATA,
] as const;

export type MarketplaceTool = (typeof MARKETPLACE_TOOLS)[number];

export function getMarketplaceTool(slug: string): MarketplaceTool | undefined {
  return MARKETPLACE_TOOLS.find((tool) => tool.slug === slug);
}
