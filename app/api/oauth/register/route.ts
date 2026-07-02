import { NextResponse, type NextRequest } from "next/server";
import { isAllowedRedirectUri, OAUTH_CORS_HEADERS } from "@/lib/oauth";
import { createAdminClient } from "@/lib/supabase/admin";

// RFC 7591 Dynamic Client Registration. Open registration, as the MCP spec
// expects: Claude (and Cowork) registers itself here before the first
// authorize redirect. Registration grants nothing by itself — every grant
// still requires a signed-in user approving the consent screen.
export async function POST(request: NextRequest) {
  let metadata: Record<string, unknown>;
  try {
    metadata = await request.json();
  } catch {
    return registrationError("invalid_client_metadata", "body must be JSON");
  }

  const redirectUris = metadata.redirect_uris;
  if (
    !Array.isArray(redirectUris) ||
    redirectUris.length === 0 ||
    redirectUris.length > 10 ||
    !redirectUris.every(
      (u) => typeof u === "string" && u.length <= 2048 && isAllowedRedirectUri(u),
    )
  ) {
    return registrationError(
      "invalid_redirect_uri",
      "redirect_uris must be 1-10 https URLs (http allowed for localhost only)",
    );
  }

  const clientName =
    typeof metadata.client_name === "string" && metadata.client_name.trim()
      ? metadata.client_name.trim().slice(0, 64)
      : "MCP client";

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("oauth_clients")
    .insert({ client_name: clientName, redirect_uris: redirectUris })
    .select("client_id, created_at")
    .single();
  if (error || !data) {
    console.error("client registration failed:", error);
    return registrationError("invalid_client_metadata", "registration failed", 500);
  }

  return NextResponse.json(
    {
      client_id: data.client_id,
      client_id_issued_at: Math.floor(new Date(data.created_at).getTime() / 1000),
      client_name: clientName,
      redirect_uris: redirectUris,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    },
    { status: 201, headers: OAUTH_CORS_HEADERS },
  );
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: OAUTH_CORS_HEADERS });
}

function registrationError(error: string, description: string, status = 400) {
  return NextResponse.json(
    { error, error_description: description },
    { status, headers: OAUTH_CORS_HEADERS },
  );
}
