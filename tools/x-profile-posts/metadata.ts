export const X_PROFILE_POSTS_METADATA = {
  slug: "x-profile-posts",
  mcpName: "x_profile_posts",
  title: "X Profile & Posts",
  releasedAt: "2026-07-02",
  pricing: "Metered Better Fetch usage",
  delivery: "Dashboard and MCP",
  categories: ["Social media", "Market research", "Social listening"],
  shortDescription:
    "Extract structured X profile and post rows with bios, follower counts, post text, engagement metrics, media URLs, hashtags, mentions, links, and timestamps.",
  description:
    "A Better Fetch social listening tool that accepts X handles, profile URLs, post URLs, and search queries, renders public pages through Better Fetch, and returns normalized profile and post rows for market research, brand monitoring, OSINT, creator research, and spreadsheet export workflows.",
  features: [
    "X handle, profile URL, post URL, and search query input",
    "Country, language, sort, and reply inclusion controls",
    "Profile username, display name, bio, followers, following, post count, location, website, avatar, verification, and joined date extraction",
    "Post ID, text, author, timestamp, likes, reposts, replies, quotes, bookmarks, views, media URLs, hashtags, mentions, links, and permalink extraction",
    "Hydration JSON, JSON-LD, and visible post-card fallback parsing",
    "Partial success when one target is blocked, empty, removed, or malformed",
  ],
  inputHighlights: ["targets", "sort", "maxPostsPerTarget", "includeReplies"],
} as const;
