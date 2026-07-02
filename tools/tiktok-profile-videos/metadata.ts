export const TIKTOK_PROFILE_VIDEOS_METADATA = {
  slug: "tiktok-profile-videos",
  mcpName: "tiktok_profile_videos",
  title: "TikTok Profile & Videos",
  releasedAt: "2026-07-02",
  pricing: "Metered Better Fetch usage",
  delivery: "Dashboard and MCP",
  categories: ["Social media", "Influencer research", "Trend monitoring"],
  shortDescription:
    "Extract structured TikTok profile and video rows with bios, follower counts, captions, engagement metrics, hashtags, mentions, media URLs, and music metadata.",
  description:
    "A Better Fetch social research tool that accepts TikTok usernames, profile URLs, video URLs, hashtag URLs, and search phrases, renders public TikTok pages through Better Fetch, and returns normalized profile and video rows for creator research, campaign monitoring, content analysis, and spreadsheet export workflows.",
  features: [
    "TikTok username, profile URL, video URL, hashtag URL, and search phrase input",
    "Country and language controls",
    "Profile username, display name, bio, followers, following, hearts, videos, verification, avatar, and profile URL extraction",
    "Video ID, caption, creator, timestamp, duration, likes, comments, shares, views, saves, media URLs, hashtags, mentions, music title, and music author extraction",
    "SIGI_STATE, hydration JSON, JSON-LD, and DOM fallback parsing",
    "Partial success when one target is blocked, empty, removed, or malformed",
  ],
  inputHighlights: ["targets", "maxVideosPerTarget", "countryCode", "languageCode"],
} as const;
