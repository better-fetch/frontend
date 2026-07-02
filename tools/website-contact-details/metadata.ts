export const WEBSITE_CONTACT_DETAILS_METADATA = {
  slug: "website-contact-details",
  mcpName: "website_contact_details",
  title: "Website Contact Details",
  releasedAt: "2026-07-02",
  pricing: "Metered Better Fetch usage",
  delivery: "Dashboard and MCP",
  categories: ["Lead generation", "Contact enrichment", "Sales research"],
  shortDescription:
    "Extract public emails, phone numbers, social profiles, contact forms, and address snippets from company websites.",
  description:
    "A Better Fetch lead-enrichment tool that accepts website URLs or domains, renders each page through Better Fetch, optionally follows likely contact/about/team links on the same origin, and returns normalized public contact signals for prospecting, CRM enrichment, and research workflows.",
  features: [
    "Website URL and bare-domain input",
    "Optional same-origin contact, about, team, support, careers, and legal page discovery",
    "Email extraction from visible text, mailto links, and common obfuscations",
    "Phone extraction from tel links and visible page text",
    "Social profile extraction for LinkedIn, X/Twitter, Facebook, Instagram, YouTube, TikTok, Pinterest, Threads, Snapchat, Discord, Telegram, WhatsApp, Reddit, and GitHub",
    "Contact form detection with method, action URL, and page source",
    "Schema.org and visible-address snippet extraction",
    "Partial success when one page is blocked, empty, unavailable, or malformed",
  ],
  inputHighlights: ["sites", "maxPagesPerSite", "includeContactPages", "strategy"],
} as const;
