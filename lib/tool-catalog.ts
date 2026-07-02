import { WEBSITE_CONTENT_CRAWLER_METADATA } from "@/tools/website-content-crawler/metadata";
import { WEBSITE_LOGO_EXTRACTOR_METADATA } from "@/tools/website-logo-extractor/metadata";
import { SITEMAP_URL_EXTRACTOR_METADATA } from "@/tools/sitemap-url-extractor/metadata";
import { RSS_FEED_READER_METADATA } from "@/tools/rss-feed-reader/metadata";
import { GOOGLE_SEARCH_RESULTS_METADATA } from "@/tools/google-search-results/metadata";
import { GOOGLE_MAPS_PLACES_METADATA } from "@/tools/google-maps-places/metadata";

export const MARKETPLACE_TOOLS = [
  WEBSITE_CONTENT_CRAWLER_METADATA,
  WEBSITE_LOGO_EXTRACTOR_METADATA,
  SITEMAP_URL_EXTRACTOR_METADATA,
  RSS_FEED_READER_METADATA,
  GOOGLE_SEARCH_RESULTS_METADATA,
  GOOGLE_MAPS_PLACES_METADATA,
] as const;

export type MarketplaceTool = (typeof MARKETPLACE_TOOLS)[number];

export function getMarketplaceTool(slug: string): MarketplaceTool | undefined {
  return MARKETPLACE_TOOLS.find((tool) => tool.slug === slug);
}
