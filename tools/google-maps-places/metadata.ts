export const GOOGLE_MAPS_PLACES_METADATA = {
  slug: "google-maps-places",
  mcpName: "google_maps_places",
  title: "Google Maps Places",
  discoveredAt: "2026-07-02",
  pricing: "Metered Better Fetch usage",
  delivery: "Dashboard and MCP",
  categories: ["Lead generation", "Market research", "Local SEO"],
  shortDescription:
    "Search Google Maps and extract structured place rows with names, categories, ratings, reviews, addresses, phones, websites, place URLs, and coordinates.",
  description:
    "A Better Fetch places tool that accepts Google Maps searches or raw Maps URLs, renders the page through Better Fetch, and returns structured local business rows for prospecting, market mapping, competitor research, and local SEO workflows.",
  features: [
    "Keyword/location and raw Google Maps URL input",
    "Country and language controls",
    "Business name, category, rating, review count, price, address, phone, and website extraction",
    "Google Maps place URL and coordinate extraction when present",
    "JSON-LD LocalBusiness fallback parsing",
    "Partial success when one search is blocked, empty, or malformed",
  ],
  inputHighlights: ["searches", "countryCode", "languageCode", "maxPlacesPerSearch"],
} as const;
