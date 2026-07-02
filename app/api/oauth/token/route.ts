import { NextResponse, type NextRequest } from "next/server";
import {
  issueGrant,
  OAUTH_CORS_HEADERS,
  rotateGrant,
  verifyPkceS256,
} from "@/lib/oauth";
import { sha256Hex } from "@/lib/keys";
import { createAdminClient } from "@/lib/supabase/admin";

// OAuth 2.1 token endpoint. Public clients only (PKCE instead of a client
// secret), exactly what Claude's connector flow uses. Accepts the spec's
// form encoding, plus JSON for lenient clients.
export async function POST(request: NextRequest) {
  let params: Record<string, string>;
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      params = await request.json();
    } else {
      params = Object.fromEntries(new URLSearchParams(await request.text()));
    }
  } catch {
    return tokenError("invalid_request", "unreadable request body");
  }

  switch (params.grant_type) {
    case "authorization_code":
      return exchangeCode(params);
    case "refresh_token":
      return refresh(params);
    default:
      return tokenError("unsupported_grant_type", "use authorization_code or refresh_token");
  }
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: OAUTH_CORS_HEADERS });
}

async function exchangeCode(params: Record<string, string>) {
  const { code, code_verifier: verifier, client_id: clientId, redirect_uri: redirectUri } = params;
  if (!code || !verifier || !clientId) {
    return tokenError("invalid_request", "code, code_verifier and client_id are required");
  }

  const admin = createAdminClient();

  // Deleting by hash redeems the code atomically: a replayed code finds no
  // row and fails, regardless of request interleaving.
  const { data: codeRow } = await admin
    .from("oauth_codes")
    .delete()
    .eq("code_hash", sha256Hex(code))
    .select("client_id, user_id, redirect_uri, code_challenge, scope, expires_at")
    .maybeSingle();

  if (!codeRow) return tokenError("invalid_grant", "unknown or already used code");
  if (new Date(codeRow.expires_at).getTime() < Date.now()) {
    return tokenError("invalid_grant", "code expired");
  }
  if (codeRow.client_id !== clientId) {
    return tokenError("invalid_grant", "code was issued to another client");
  }
  if (codeRow.redirect_uri !== redirectUri) {
    return tokenError("invalid_grant", "redirect_uri does not match the authorization request");
  }
  if (!verifyPkceS256(verifier, codeRow.code_challenge)) {
    return tokenError("invalid_grant", "PKCE verification failed");
  }

  const { data: client } = await admin
    .from("oauth_clients")
    .select("client_name")
    .eq("client_id", clientId)
    .maybeSingle();

  const grant = await issueGrant(admin, {
    userId: codeRow.user_id,
    clientId,
    clientName: client?.client_name ?? "MCP client",
    scope: codeRow.scope,
  });

  return tokenResponse(grant, codeRow.scope);
}

async function refresh(params: Record<string, string>) {
  const { refresh_token: refreshToken, client_id: clientId } = params;
  if (!refreshToken || !clientId) {
    return tokenError("invalid_request", "refresh_token and client_id are required");
  }

  const admin = createAdminClient();
  const grant = await rotateGrant(admin, { refreshToken, clientId });
  if (!grant) return tokenError("invalid_grant", "unknown, revoked, or mismatched refresh token");

  return tokenResponse(grant, undefined);
}

function tokenResponse(
  grant: { accessToken: string; refreshToken: string; expiresIn: number },
  scope: string | undefined,
) {
  return NextResponse.json(
    {
      access_token: grant.accessToken,
      token_type: "Bearer",
      expires_in: grant.expiresIn,
      refresh_token: grant.refreshToken,
      ...(scope ? { scope } : {}),
    },
    {
      headers: {
        ...OAUTH_CORS_HEADERS,
        "Cache-Control": "no-store",
        Pragma: "no-cache",
      },
    },
  );
}

function tokenError(error: string, description: string) {
  return NextResponse.json(
    { error, error_description: description },
    { status: 400, headers: { ...OAUTH_CORS_HEADERS, "Cache-Control": "no-store" } },
  );
}
