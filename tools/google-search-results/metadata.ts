export const GOOGLE_SEARCH_RESULTS_METADATA = {
  slug: "google-search-results",
  mcpName: "google_search_results",
  title: "Google Search Results",
  releasedAt: "2026-07-02",
  pricing: "Metered Better Fetch usage",
  delivery: "Dashboard and MCP",
  categories: ["SEO tools", "Market research", "Lead generation"],
  shortDescription:
    "Fetch Google search result pages from keywords or Google search URLs and extract organic results, sponsored results, People Also Ask, and related queries.",
  description:
    "A Better Fetch search results tool that accepts search terms or raw Google search URLs, renders result pages through Better Fetch, and returns structured SERP page records for SEO monitoring, competitor research, lead discovery, and content workflows.",
  features: [
    "Keyword and raw Google search URL input",
    "Country, language, domain, and pagination controls",
    "Organic result title, URL, display URL, and snippet extraction",
    "Sponsored result extraction when ads are visible in the fetched page",
    "People Also Ask and related query extraction",
    "Partial success when one query or page is blocked, empty, or malformed",
  ],
  inputHighlights: [
    "queries",
    "countryCode",
    "languageCode",
    "maxPagesPerQuery",
    "resultsPerPage",
  ],
} as const;
