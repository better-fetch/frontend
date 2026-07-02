export const REDDIT_POSTS_COMMENTS_METADATA = {
  slug: "reddit-posts-comments",
  mcpName: "reddit_posts_comments",
  title: "Reddit Posts & Comments",
  releasedAt: "2026-07-02",
  pricing: "Metered Better Fetch usage",
  delivery: "Dashboard and MCP",
  categories: ["Social media", "Market research", "Community intelligence"],
  shortDescription:
    "Extract structured Reddit posts and visible comment rows from subreddit pages, search pages, user pages, and direct post URLs.",
  description:
    "A Better Fetch social research tool that accepts Reddit URLs, subreddit names, user names, or keyword searches, renders Reddit pages through Better Fetch, and returns normalized post and comment rows for market research, sentiment triage, community monitoring, and spreadsheet export workflows.",
  features: [
    "Subreddit, user, search query, and direct post URL input",
    "Sort, time range, country, and language controls",
    "Post title, subreddit, author, body, score, comment count, flair, media, outbound URL, and permalink extraction",
    "Visible comment author, body, score, timestamp, depth, parent, and permalink extraction",
    "JSON-LD DiscussionForumPosting fallback parsing",
    "Partial success when one source is blocked, empty, or malformed",
  ],
  inputHighlights: ["sources", "sort", "timeRange", "maxPostsPerSource", "includeComments"],
} as const;
