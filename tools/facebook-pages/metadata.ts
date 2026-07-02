export const FACEBOOK_PAGES_METADATA = {
  slug: "facebook-pages",
  mcpName: "facebook_pages",
  title: "Facebook Pages",
  releasedAt: "2026-07-02",
  pricing: "Metered Better Fetch usage",
  delivery: "Dashboard and MCP",
  categories: ["Social media", "Lead generation", "Market research"],
  shortDescription:
    "Extract structured public Facebook Page and Profile rows with names, bios, contact details, websites, ratings, likes, followers, photos, and ad-status signals.",
  description:
    "A Better Fetch lead and social research tool that accepts public Facebook Page URLs, profile URLs, numeric page IDs, and page handles, renders the target with Better Fetch, and returns normalized page metadata for enrichment, monitoring, and export workflows.",
  features: [
    "Facebook Page URL, Profile URL, numeric page ID, and handle input",
    "Home or About section targeting with country, language, and strategy controls",
    "Page title, username, canonical URL, categories, intro, about text, and external links",
    "Website, email, phone, address, Messenger URL, profile image, and cover image extraction",
    "Likes, followers, talking-about, check-in, were-here, rating, creation-date, and ad-status fields",
    "Hydration JSON, JSON-LD, Open Graph, and visible page-text fallback parsing",
    "Partial success when one page is blocked, login-gated, unavailable, or malformed",
  ],
  inputHighlights: ["pages", "section", "maxPages", "strategy"],
} as const;
