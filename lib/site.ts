import "server-only";

import type { NextRequest } from "next/server";

export function absoluteUrl(path: string, request: NextRequest): URL {
  const hostname = request.nextUrl.hostname;
  const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1";
  const origin = isLocalhost
    ? request.nextUrl.origin
    : (process.env.NEXT_PUBLIC_SITE_URL ?? request.nextUrl.origin);

  return new URL(path, origin);
}
