export const WEBSITE_CONTENT_CRAWLER_METADATA = {
  slug: "website-content-crawler",
  mcpName: "website_content_crawler",
  title: "Website Content Crawler",
  discoveredAt: "2026-07-02",
  pricing: "Metered Better Fetch usage",
  delivery: "Dashboard and MCP",
  categories: ["AI", "Developer tools"],
  shortDescription:
    "Crawl websites and extract clean text or Markdown for AI models, LLM apps, vector databases, and RAG pipelines.",
  description:
    "A Better Fetch crawler that starts from one or more URLs, stays inside the selected crawl scope, renders pages through Better Fetch, strips noisy DOM, and returns structured records with metadata, text, Markdown, and crawl provenance.",
  features: [
    "Start from one or more URLs",
    "Stay under the starting path or origin",
    "Use Better Fetch browser or HTTP strategy per page",
    "Remove navigation, footer, scripts, forms, and other page chrome",
    "Return text, Markdown, metadata, and crawl details for RAG ingestion",
  ],
  inputHighlights: [
    "start_urls",
    "max_pages",
    "max_depth",
    "scope",
    "output_format",
    "exclude_globs",
  ],
} as const;

export type ToolMetadata = typeof WEBSITE_CONTENT_CRAWLER_METADATA;
