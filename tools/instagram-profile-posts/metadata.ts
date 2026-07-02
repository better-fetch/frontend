export const INSTAGRAM_PROFILE_POSTS_METADATA = {
  slug: "instagram-profile-posts",
  mcpName: "instagram_profile_posts",
  title: "Instagram Profile & Posts",
  releasedAt: "2026-07-02",
  pricing: "Metered Better Fetch usage",
  delivery: "Dashboard and MCP",
  categories: ["Social media", "Influencer research", "Content analytics"],
  shortDescription:
    "Extract structured Instagram profile, post, reel, and hashtag rows with bios, captions, engagement metrics, media URLs, hashtags, mentions, and timestamps.",
  description:
    "A Better Fetch social research tool that accepts Instagram usernames, profile URLs, post or reel URLs, and hashtag URLs, renders public pages through Better Fetch, and returns normalized profile and post rows for influencer research, trend monitoring, content analysis, and spreadsheet export workflows.",
  features: [
    "Instagram username, profile URL, post URL, reel URL, and hashtag URL input",
    "Country and language controls",
    "Profile username, full name, biography, follower count, following count, post count, external URL, verification, privacy, and image extraction",
    "Post shortcode, type, caption, author, timestamp, likes, comments, views, duration, media URLs, hashtags, mentions, location, and permalink extraction",
    "JSON-LD, embedded page-state, and DOM fallback parsing",
    "Partial success when one target is blocked, private, removed, or malformed",
  ],
  inputHighlights: ["targets", "maxPostsPerTarget", "countryCode", "languageCode"],
} as const;
