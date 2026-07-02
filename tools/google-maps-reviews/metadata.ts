export const GOOGLE_MAPS_REVIEWS_METADATA = {
  slug: "google-maps-reviews",
  mcpName: "google_maps_reviews",
  title: "Google Maps Reviews",
  releasedAt: "2026-07-03",
  pricing: "Metered Better Fetch usage",
  delivery: "Dashboard and MCP",
  categories: ["Reviews", "Local business", "Market research"],
  shortDescription:
    "Extract structured Google Maps review rows with ratings, text, reviewer details, owner replies, photos, and place metadata.",
  description:
    "A Better Fetch review-monitoring tool that accepts Google Maps place URLs, review URLs, CID/place identifiers, and location searches, renders the target through Better Fetch, and returns normalized public review rows for reputation monitoring, competitor research, and local market analysis.",
  features: [
    "Google Maps place URL, review URL, CID/place ID, and search input",
    "Country, language, sort, and maximum review controls",
    "Place title, category, address, rating, review count, place ID, coordinates, and canonical URL extraction",
    "Review ID, text, rating, reviewer name, reviewer profile URL, review count, profile photo, relative date, published date, language, likes, photos, and review URL extraction",
    "Owner response text and response date extraction when visible",
    "Hydration JSON, JSON-LD, and visible review-card fallback parsing",
    "Partial success when one target is blocked, empty, removed, or malformed",
  ],
  inputHighlights: ["targets", "sort", "maxReviewsPerTarget", "strategy"],
} as const;
