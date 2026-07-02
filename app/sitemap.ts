import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { listPosts } from "@/lib/blog";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = "https://betterfetch.co";
  // Render at request time, mirroring app/blog/page.tsx: at Docker build the
  // content repo isn't reachable, so a statically generated sitemap would bake
  // in an empty post list and omit every blog post until the next deploy. The
  // tagged data cache keeps this cheap. listPosts still degrades to [] on a
  // content-repo outage, so the static entries always render.
  await connection();
  const posts = await listPosts();
  return [
    { url: `${base}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/docs`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${base}/mcp`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/tools`, changeFrequency: "weekly", priority: 0.8 },
    {
      url: `${base}/tools/website-content-crawler`,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: `${base}/tools/website-logo-extractor`,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: `${base}/tools/sitemap-url-extractor`,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: `${base}/tools/rss-feed-reader`,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: `${base}/tools/google-search-results`,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: `${base}/tools/google-maps-places`,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: `${base}/tools/amazon-product-details`,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: `${base}/tools/youtube-video-details`,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: `${base}/tools/reddit-posts-comments`,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: `${base}/tools/instagram-profile-posts`,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    { url: `${base}/plugin`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/blog`, changeFrequency: "weekly", priority: 0.7 },
    ...posts.map((post) => ({
      url: `${base}/blog/${post.slug}`,
      lastModified: new Date(`${post.date}T00:00:00Z`),
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
  ];
}
