export const AMAZON_PRODUCT_DETAILS_METADATA = {
  slug: "amazon-product-details",
  mcpName: "amazon_product_details",
  title: "Amazon Product Details",
  discoveredAt: "2026-07-02",
  pricing: "Metered Better Fetch usage",
  delivery: "Dashboard and MCP",
  categories: ["E-commerce", "Price monitoring", "Market research"],
  shortDescription:
    "Extract structured Amazon product detail rows with ASIN, title, brand, pricing, ratings, availability, images, bullets, categories, and specifications.",
  description:
    "A Better Fetch e-commerce tool that accepts Amazon product URLs or ASINs, renders product pages through Better Fetch, and returns normalized product detail rows for price monitoring, catalog enrichment, competitor research, and spreadsheet export workflows.",
  features: [
    "Amazon product URL and ASIN input",
    "Amazon domain, country, and language controls",
    "Title, ASIN, brand, price, currency, list price, availability, seller, rating, and review count extraction",
    "Bullet points, description, image URLs, category breadcrumbs, and specification table parsing",
    "JSON-LD Product fallback parsing",
    "Partial success when one product is blocked, unavailable, or malformed",
  ],
  inputHighlights: ["products", "amazonDomain", "countryCode", "languageCode"],
} as const;
