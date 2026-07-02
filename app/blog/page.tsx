import type { Metadata } from "next";
import { connection } from "next/server";
import { BlogCard } from "@/components/blog-card";
import { listPosts } from "@/lib/blog";

export const metadata: Metadata = {
  title: "Blog",
  description:
    "Notes from building Better Fetch — browser-grade fetching, scraping, and the agentic web.",
  alternates: { canonical: "/blog" },
};

export default async function BlogIndex() {
  // Render at request time: at Docker build the content repo isn't
  // reachable, and baking an empty list into the static shell would stick
  // until the next deploy. The tagged data cache keeps this cheap.
  await connection();
  const posts = await listPosts();

  return (
    <div className="space-y-10">
      <section className="space-y-2 pt-6 text-center">
        <h1 className="text-4xl font-semibold tracking-tight">Blog</h1>
        <p className="mx-auto max-w-xl text-lg text-muted-foreground">
          Notes from building Better Fetch.
        </p>
      </section>
      {posts.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground">
          No posts yet — check back soon.
        </p>
      ) : (
        <section className="grid gap-4 sm:grid-cols-2">
          {posts.map((post) => (
            <BlogCard key={post.slug} post={post} />
          ))}
        </section>
      )}
    </div>
  );
}
