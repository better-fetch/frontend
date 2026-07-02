import Link from "next/link";
import { formatPostDate, type BlogPost } from "@/lib/blog";
import { blogArtSvg } from "@/lib/blog-art";

export function BlogCard({ post }: { post: BlogPost }) {
  return (
    <Link
      href={`/blog/${post.slug}`}
      className="group relative block aspect-[16/10] overflow-hidden rounded-xl ring-1 ring-foreground/10 transition hover:ring-primary/40"
    >
      <div
        aria-hidden
        className="absolute inset-0 transition-transform duration-500 group-hover:scale-105"
        dangerouslySetInnerHTML={{ __html: blogArtSvg(post.hash) }}
      />
      {/* Blur strongest at the bottom where the text sits, fading upward to
          leave the art crisp, with a dark gradient for contrast. */}
      <div
        aria-hidden
        className="absolute inset-0 backdrop-blur-md [mask-image:linear-gradient(to_top,black_25%,transparent_65%)]"
      />
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-t from-[#11111b]/90 via-[#11111b]/35 to-transparent"
      />
      <div className="absolute inset-x-0 bottom-0 space-y-1 p-4">
        <p className="text-xs text-muted-foreground">
          <time dateTime={post.date}>{formatPostDate(post.date)}</time>
          {" · "}
          {post.author}
        </p>
        <h2 className="font-heading font-medium leading-snug">{post.title}</h2>
        <p className="line-clamp-2 text-sm text-muted-foreground">
          {post.description}
        </p>
      </div>
    </Link>
  );
}
