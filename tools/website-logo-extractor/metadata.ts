export const WEBSITE_LOGO_EXTRACTOR_METADATA = {
  slug: "website-logo-extractor",
  mcpName: "website_logo_extractor",
  title: "Website Logo Extractor",
  releasedAt: "2026-07-02",
  pricing: "Metered Better Fetch usage",
  delivery: "Dashboard and MCP",
  categories: ["Automation", "Marketing"],
  shortDescription:
    "Extract favicons, logo images, OpenGraph images, Twitter images, schema.org logos, inline SVGs, and manifest icons from websites.",
  description:
    "A Better Fetch tool that accepts one or more website URLs, fetches the initial HTML, extracts logo-related assets from common metadata and markup locations, deduplicates asset URLs, and returns structured logo records for brand monitoring, enrichment, and design research.",
  features: [
    "Bulk URL input",
    "Favicon and apple-touch-icon discovery",
    "OpenGraph and Twitter card image discovery",
    "schema.org logo extraction from JSON-LD",
    "Logo-like image and inline SVG extraction",
    "Optional manifest icon extraction",
  ],
  inputHighlights: ["urls", "maxConcurrency", "timeoutSecs"],
} as const;
