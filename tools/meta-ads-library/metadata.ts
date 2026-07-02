export const META_ADS_LIBRARY_METADATA = {
  slug: "meta-ads-library",
  mcpName: "meta_ads_library",
  title: "Meta Ads Library",
  releasedAt: "2026-07-02",
  pricing: "Metered Better Fetch usage",
  delivery: "Dashboard and MCP",
  categories: ["Ad intelligence", "Marketing research", "Competitive analysis"],
  shortDescription:
    "Extract structured Meta Ads Library rows with advertiser, ad copy, creative media, platforms, active dates, CTA links, spend, reach, and impression signals.",
  description:
    "A Better Fetch ad intelligence tool that accepts Meta Ads Library URLs, Facebook page IDs, and keyword searches, renders public library pages through Better Fetch, and returns normalized ad rows for competitor monitoring, creative research, compliance review, and spreadsheet export workflows.",
  features: [
    "Meta Ads Library URL, Facebook page ID, and keyword search input",
    "Country, language, active status, and media type controls",
    "Advertiser page ID, page name, page profile URL, ad library ID, status, platforms, and dates",
    "Ad text, headline, description, CTA, destination URL, creative image URLs, video URLs, snapshot URL, and display URL extraction",
    "Spend, impressions, reach, currency, countries, languages, and category signals when present",
    "Hydration JSON, embedded data, and visible ad-card fallback parsing",
  ],
  inputHighlights: ["targets", "activeStatus", "countryCode", "maxAdsPerTarget"],
} as const;
