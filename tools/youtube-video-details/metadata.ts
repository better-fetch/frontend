export const YOUTUBE_VIDEO_DETAILS_METADATA = {
  slug: "youtube-video-details",
  mcpName: "youtube_video_details",
  title: "YouTube Video Details",
  releasedAt: "2026-07-02",
  pricing: "Metered Better Fetch usage",
  delivery: "Dashboard and MCP",
  categories: ["Social media", "Market research", "Content analytics"],
  shortDescription:
    "Extract structured YouTube video rows with title, channel, description, duration, views, likes, comments, publish dates, keywords, and thumbnails.",
  description:
    "A Better Fetch social video tool that accepts YouTube video URLs or video IDs, renders watch pages through Better Fetch, and returns normalized video detail rows for content monitoring, trend research, creator analysis, and spreadsheet export workflows.",
  features: [
    "YouTube watch, short, embed, youtu.be URL, and video ID input",
    "Country and language controls",
    "Title, video ID, canonical URL, channel name, channel ID, and channel URL extraction",
    "Description, duration, view count, like count, comment count, category, and keyword extraction",
    "Publish/upload dates, live/short detection, and thumbnail URL extraction",
    "Partial success when one video is blocked, removed, or malformed",
  ],
  inputHighlights: ["videos", "countryCode", "languageCode"],
} as const;
