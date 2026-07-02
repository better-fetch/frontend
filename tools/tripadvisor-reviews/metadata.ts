export const TRIPADVISOR_REVIEWS_METADATA = {
  slug: "tripadvisor-reviews",
  mcpName: "tripadvisor_reviews",
  title: "Tripadvisor Reviews",
  releasedAt: "2026-07-03",
  pricing: "Metered Better Fetch usage",
  delivery: "Dashboard and MCP",
  categories: ["Reviews", "Travel", "Hospitality research"],
  shortDescription:
    "Extract structured Tripadvisor review rows with ratings, titles, review text, travel dates, helpful votes, reviewer details, owner responses, images, and place metadata.",
  description:
    "A Better Fetch hospitality research tool that accepts Tripadvisor place URLs, review URLs, location IDs, and search terms, renders public pages through Better Fetch, and returns normalized review rows for reputation monitoring, competitor analysis, and travel market research.",
  features: [
    "Tripadvisor place URL, review URL, location ID, and search input",
    "Country, language, sort, and maximum review controls",
    "Place name, category, address, rating, review count, ranking, location ID, and canonical URL extraction",
    "Review ID, URL, title, text, rating, published date, travel date, trip type, language, helpful votes, and image URLs",
    "Reviewer username, display name, profile URL, avatar, contribution count, and home location extraction",
    "Owner response text and response date extraction when visible",
    "Hydration JSON, JSON-LD, and visible review-card fallback parsing",
    "Partial success when one target is blocked, empty, unavailable, or malformed",
  ],
  inputHighlights: ["targets", "sort", "maxReviewsPerTarget", "strategy"],
} as const;
