import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Markdown } from "@/components/markdown";
import { formatPostDate, getPost } from "@/lib/blog";
import { blogArtSvg } from "@/lib/blog-art";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) return {};
  return {
    title: post.title,
    description: post.description,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      type: "article",
      title: post.title,
      description: post.description,
      publishedTime: `${post.date}T00:00:00Z`,
      authors: [post.author],
      url: `/blog/${post.slug}`,
    },
  };
}

export default async function BlogPost({ params }: Props) {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) notFound();

  return (
    <article className="mx-auto max-w-2xl space-y-8">
      <div className="relative aspect-[21/9] overflow-hidden rounded-xl ring-1 ring-foreground/10">
        <div
          aria-hidden
          className="absolute inset-0"
          dangerouslySetInnerHTML={{ __html: blogArtSvg(post.hash) }}
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-t from-[#11111b]/60 to-transparent"
        />
      </div>
      <header className="space-y-3">
        <p className="text-sm text-muted-foreground">
          <time dateTime={post.date}>{formatPostDate(post.date)}</time>
          {" · "}
          {post.author}
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">{post.title}</h1>
        <p className="text-lg text-muted-foreground">{post.description}</p>
      </header>
      <div className="space-y-5">
        <Markdown>{post.content}</Markdown>
      </div>
      <footer className="border-t pt-6">
        <Link
          href="/blog"
          className="text-sm font-medium text-primary hover:underline"
        >
          ← All posts
        </Link>
      </footer>
    </article>
  );
}
