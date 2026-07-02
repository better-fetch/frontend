import { revalidateTag } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { BLOG_CACHE_TAG } from "@/lib/blog";

// Called by the content repo's publish GitHub Action on every push to main,
// so new posts go live without a redeploy.
export async function POST(request: NextRequest) {
  const secret = process.env.BLOG_REVALIDATE_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  // "max" = serve stale while the fresh content regenerates in the
  // background, per the Next 16 revalidateTag signature.
  revalidateTag(BLOG_CACHE_TAG, "max");
  return NextResponse.json({ revalidated: true });
}
