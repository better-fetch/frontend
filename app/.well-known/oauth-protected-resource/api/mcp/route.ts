import { NextResponse, type NextRequest } from "next/server";
import { OAUTH_CORS_HEADERS, protectedResourceMetadata } from "@/lib/oauth";
import { absoluteUrl } from "@/lib/site";

export async function GET(request: NextRequest) {
  return NextResponse.json(protectedResourceMetadata(absoluteUrl("/", request).origin), {
    headers: OAUTH_CORS_HEADERS,
  });
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: OAUTH_CORS_HEADERS });
}
