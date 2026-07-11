import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { listPosts } from "@/lib/blog";
import { getLiveTools } from "@/lib/tools-registry";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = "https://betterfetch.co";
  // Render at request time, mirroring app/blog/page.tsx: at Docker build the
  // content repo isn't reachable, so a statically generated sitemap would bake
  // in an empty post list and omit every blog post until the next deploy. The
  // tagged data cache keeps this cheap. listPosts still degrades to [] on a
  // content-repo outage, so the static entries always render.
  await connection();
  const [posts, tools] = await Promise.all([
    listPosts(),
    getLiveTools({ force: true }).catch(() => []),
  ]);
  return [
    { url: `${base}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/docs`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${base}/mcp`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/plugin`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/tools`, changeFrequency: "daily", priority: 0.9 },
    ...tools.map((tool) => ({
      url: `${base}/tools/${tool.name}`,
      lastModified: tool.validated_at ? new Date(tool.validated_at) : undefined,
      changeFrequency: "weekly" as const,
      priority: tool.popularity_rank && tool.popularity_rank <= 6 ? 0.85 : 0.75,
    })),
    { url: `${base}/blog`, changeFrequency: "weekly", priority: 0.7 },
    ...posts.map((post) => ({
      url: `${base}/blog/${post.slug}`,
      lastModified: new Date(`${post.date}T00:00:00Z`),
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
  ];
}
