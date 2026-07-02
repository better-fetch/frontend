import "server-only";

import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateApiKey, randomBase62, sha256Hex } from "@/lib/keys";

// OAuth 2.1 authorization server for the remote MCP connector (Claude,
// Claude Cowork, Claude Desktop, and any spec-compliant MCP client).
//
// The access token we issue IS a `bf_` API key: a row in api_keys named
// after the client, so the backend's existing key validation and usage
// metering cover MCP calls with no backend changes. Users see the key on
// /keys and can revoke it there to disconnect the client.

export const OAUTH_SCOPE = "fetch";
export const CODE_TTL_MS = 10 * 60 * 1000; // authorization codes: 10 minutes
export const ACCESS_TOKEN_TTL_S = 30 * 24 * 60 * 60; // 30 days; refresh rotates

export function generateAuthorizationCode(): { code: string; hash: string } {
  const code = "bfc_" + randomBase62();
  return { code, hash: sha256Hex(code) };
}

export function generateRefreshToken(): { token: string; hash: string } {
  const token = "bfr_" + randomBase62();
  return { token, hash: sha256Hex(token) };
}

// PKCE S256: base64url(sha256(verifier)) must equal the stored challenge.
export function verifyPkceS256(verifier: string, challenge: string): boolean {
  const digest = createHash("sha256").update(verifier, "ascii").digest("base64url");
  return digest === challenge;
}

// Registered redirect URIs must be https, except loopback hosts for local
// development clients (MCP inspector, IDEs).
export function isAllowedRedirectUri(uri: string): boolean {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return false;
  }
  if (url.hash) return false;
  if (url.protocol === "https:") return true;
  return (
    url.protocol === "http:" &&
    (url.hostname === "localhost" || url.hostname === "127.0.0.1")
  );
}

export type OauthClient = {
  client_id: string;
  client_name: string;
  redirect_uris: string[];
};

export async function getOauthClient(
  admin: SupabaseClient,
  clientId: string,
): Promise<OauthClient | null> {
  // client_id is a uuid column; a malformed id should read as "unknown
  // client", not a Postgres type error.
  if (!/^[0-9a-f-]{36}$/i.test(clientId)) return null;
  const { data } = await admin
    .from("oauth_clients")
    .select("client_id, client_name, redirect_uris")
    .eq("client_id", clientId)
    .maybeSingle();
  return data;
}

// Approve a grant: retire any previous grant this client holds for the user
// (one connection per user+client keeps /keys tidy and bounds key count),
// mint a fresh API key as the access token, and attach a refresh token.
export async function issueGrant(
  admin: SupabaseClient,
  args: { userId: string; clientId: string; clientName: string; scope: string },
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  const { data: previous } = await admin
    .from("oauth_grants")
    .select("id, api_key_id")
    .eq("user_id", args.userId)
    .eq("client_id", args.clientId)
    .is("revoked_at", null);
  if (previous?.length) {
    const now = new Date().toISOString();
    await admin
      .from("oauth_grants")
      .update({ revoked_at: now, updated_at: now })
      .in("id", previous.map((g) => g.id));
    await admin
      .from("api_keys")
      .update({ revoked_at: now })
      .in("id", previous.map((g) => g.api_key_id))
      .is("revoked_at", null);
  }

  const key = generateApiKey();
  const { data: keyRow, error: keyError } = await admin
    .from("api_keys")
    .insert({
      user_id: args.userId,
      name: `${args.clientName} (MCP connector)`.slice(0, 64),
      key_hash: key.hash,
      key_prefix: key.prefix,
    })
    .select("id")
    .single();
  if (keyError || !keyRow) {
    throw new Error(`api key insert failed: ${keyError?.message}`);
  }

  const refresh = generateRefreshToken();
  const { error: grantError } = await admin.from("oauth_grants").insert({
    user_id: args.userId,
    client_id: args.clientId,
    api_key_id: keyRow.id,
    access_expires_at: new Date(Date.now() + ACCESS_TOKEN_TTL_S * 1000).toISOString(),
    refresh_token_hash: refresh.hash,
    scope: args.scope,
  });
  if (grantError) {
    await admin
      .from("api_keys")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", keyRow.id);
    throw new Error(`grant insert failed: ${grantError.message}`);
  }

  return {
    accessToken: key.token,
    refreshToken: refresh.token,
    expiresIn: ACCESS_TOKEN_TTL_S,
  };
}

// Refresh-token grant: rotate everything — new API key, new refresh token —
// and retire the old key, so a leaked old token dies on first rotation.
export async function rotateGrant(
  admin: SupabaseClient,
  args: { refreshToken: string; clientId: string },
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number } | null> {
  const { data: grant } = await admin
    .from("oauth_grants")
    .select("id, user_id, client_id, api_key_id, scope, api_keys(name)")
    .eq("refresh_token_hash", sha256Hex(args.refreshToken))
    .is("revoked_at", null)
    .maybeSingle();
  if (!grant || grant.client_id !== args.clientId) return null;

  const key = generateApiKey();
  const keyName =
    (grant.api_keys as unknown as { name: string } | null)?.name ??
    "MCP connector";
  const { data: keyRow, error: keyError } = await admin
    .from("api_keys")
    .insert({
      user_id: grant.user_id,
      name: keyName,
      key_hash: key.hash,
      key_prefix: key.prefix,
    })
    .select("id")
    .single();
  if (keyError || !keyRow) {
    throw new Error(`api key insert failed: ${keyError?.message}`);
  }

  const refresh = generateRefreshToken();
  const now = new Date().toISOString();
  const { error: updateError } = await admin
    .from("oauth_grants")
    .update({
      api_key_id: keyRow.id,
      refresh_token_hash: refresh.hash,
      access_expires_at: new Date(Date.now() + ACCESS_TOKEN_TTL_S * 1000).toISOString(),
      updated_at: now,
    })
    .eq("id", grant.id)
    .is("revoked_at", null);
  if (updateError) {
    await admin.from("api_keys").update({ revoked_at: now }).eq("id", keyRow.id);
    throw new Error(`grant rotate failed: ${updateError.message}`);
  }

  await admin
    .from("api_keys")
    .update({ revoked_at: now })
    .eq("id", grant.api_key_id)
    .is("revoked_at", null);

  return {
    accessToken: key.token,
    refreshToken: refresh.token,
    expiresIn: ACCESS_TOKEN_TTL_S,
  };
}

// RFC 9728 protected resource metadata: tells MCP clients which
// authorization server issues tokens for the /api/mcp resource. Served at
// /.well-known/oauth-protected-resource and the path-suffixed variant
// (.../oauth-protected-resource/api/mcp) that spec-compliant clients try
// first; both route files render this.
export function protectedResourceMetadata(origin: string) {
  return {
    resource: `${origin}/api/mcp`,
    authorization_servers: [origin],
    scopes_supported: [OAUTH_SCOPE],
    bearer_methods_supported: ["header"],
    resource_documentation: `${origin}/mcp`,
  };
}

// CORS for the OAuth endpoints: browser-based MCP clients (inspector, web
// IDEs) call these cross-origin. Tokens travel in bodies, never cookies, so
// a wildcard origin is safe here.
export const OAUTH_CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, mcp-protocol-version",
  "Access-Control-Max-Age": "86400",
} as const;
