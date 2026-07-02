export const RSS_FEED_READER_METADATA = {
  slug: "rss-feed-reader",
  mcpName: "rss_feed_reader",
  title: "RSS Feed Reader",
  discoveredAt: "2026-07-02",
  pricing: "Metered Better Fetch usage",
  delivery: "Dashboard and MCP",
  categories: ["Developer tools"],
  shortDescription:
    "Read public RSS, Atom, RDF, and JSON Feed URLs into normalized feed item rows for API workflows, schedules, and exports.",
  description:
    "A Better Fetch tool that accepts one or more public feed URLs, parses RSS 2.0, Atom, RDF, and JSON Feed payloads, and returns structured rows with source metadata, stable item keys, dates, authors, categories, summaries, content, images, and enclosures.",
  features: [
    "Batch feed URL input",
    "RSS 2.0, Atom, RDF, and JSON Feed parsing",
    "Feed item title, URL, GUID, and stable itemKey extraction",
    "Publication and update date normalization",
    "Author, category, summary, content, image, and enclosure extraction",
    "Published-after filtering and per-feed/global item caps",
    "Partial success when one feed is blocked, empty, or malformed",
  ],
  inputHighlights: [
    "feedUrls",
    "publishedAfter",
    "maxItemsPerFeed",
    "maxTotalItems",
  ],
} as const;
