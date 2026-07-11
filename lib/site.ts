import "server-only";

import type { NextRequest } from "next/server";

// Behind Fly's proxy, request.nextUrl.origin resolves to the container's
// bind address (0.0.0.0:3000), not the public hostname — never redirect to
// it. NEXT_PUBLIC_SITE_URL is authoritative in production; the request
// origin is only a dev fallback.
export function absoluteUrl(path: string, request: NextRequest): URL {
  return new URL(path, process.env.NEXT_PUBLIC_SITE_URL ?? request.nextUrl.origin);
}
