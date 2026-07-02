import { NextResponse, type NextRequest } from "next/server";
import { generateApiKey } from "@/lib/keys";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  crawlWebsiteContent,
  WEBSITE_CONTENT_CRAWLER_INPUT_SCHEMA,
  type WebsiteContentCrawlerFetchResult,
} from "@/tools/website-content-crawler/runtime";

const API_BASE = process.env.BETTER_FETCH_API_URL ?? "https://api.betterfetch.co";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "not signed in" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const parsed = WEBSITE_CONTENT_CRAWLER_INPUT_SCHEMA.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { token, hash, prefix } = generateApiKey();
  const { data: key, error: insertError } = await admin
    .from("api_keys")
    .insert({
      user_id: user.id,
      name: "Dashboard: Website Content Crawler",
      key_hash: hash,
      key_prefix: prefix,
    })
    .select("id")
    .single();

  if (insertError || !key) {
    console.error("dashboard tool key insert failed:", insertError);
    return NextResponse.json({ error: "could not start tool run" }, { status: 500 });
  }

  try {
    const crawl = await crawlWebsiteContent(parsed.data, async (pageRequest) => {
      const response = await fetch(`${API_BASE}/v1/fetch`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          url: pageRequest.url,
          wait_ms: pageRequest.wait_ms,
          timeout_ms: pageRequest.timeout_ms,
          strategy: pageRequest.strategy,
          country: pageRequest.country,
          session: pageRequest.session,
          cache_ttl_ms: pageRequest.cache_ttl_ms,
          return_response_text: true,
          include_html: true,
        }),
        signal: AbortSignal.timeout(260_000),
      });
      return parseFetchResponse(response);
    });

    return NextResponse.json(crawl);
  } finally {
    const { error } = await admin
      .from("api_keys")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", key.id)
      .eq("user_id", user.id);
    if (error) console.error("dashboard tool key revoke failed:", error);
  }
}

async function parseFetchResponse(
  response: Response,
): Promise<WebsiteContentCrawlerFetchResult> {
  const text = await response.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    return {
      ok: false,
      error: "fetch_failed",
      message: `Better Fetch returned ${response.status} ${response.statusText || "non-JSON response"}`,
      status: response.status,
    };
  }

  if (!response.ok && typeof parsed === "object" && parsed !== null && !("ok" in parsed)) {
    const body = parsed as { error?: string; message?: string; reason?: string };
    return {
      ok: false,
      error: body.error ?? "fetch_failed",
      message: body.message ?? body.reason ?? `Better Fetch returned ${response.status}`,
      status: response.status,
    };
  }

  return parsed as WebsiteContentCrawlerFetchResult;
}
