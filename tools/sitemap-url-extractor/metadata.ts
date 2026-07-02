export const SITEMAP_URL_EXTRACTOR_METADATA = {
  slug: "sitemap-url-extractor",
  mcpName: "sitemap_url_extractor",
  title: "Sitemap URL Extractor",
  releasedAt: "2026-07-02",
  pricing: "Metered Better Fetch usage",
  delivery: "Dashboard and MCP",
  categories: ["SEO tools", "Developer tools"],
  shortDescription:
    "Parse XML sitemaps and sitemap indexes into URL inventory rows with lastmod, changefreq, priority, image, and video metadata.",
  description:
    "A Better Fetch tool that accepts one or more XML sitemap URLs, follows sitemap indexes recursively up to three levels deep, and returns structured URL inventory records for SEO audits, migrations, monitoring, and downstream scraping pipelines.",
  features: [
    "Batch sitemap URL input",
    "URL set and sitemap index parsing",
    "Recursive child sitemap following up to 3 levels",
    "lastModified, changeFrequency, and priority extraction",
    "Image and video sitemap extension detection",
    "Configurable max URL limit",
  ],
  inputHighlights: ["sitemapUrls", "maxUrls"],
} as const;
