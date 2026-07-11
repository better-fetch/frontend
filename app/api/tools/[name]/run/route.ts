import { NextResponse, type NextRequest } from "next/server";
import { generateApiKey, sha256Hex } from "@/lib/keys";
import {
  decryptPlaygroundKey,
  encryptPlaygroundKey,
  playgroundKmsConfigured,
} from "@/lib/playground-key";
import { runTool } from "@/lib/runner-client";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getLiveTool } from "@/lib/tools-registry";

export const runtime = "nodejs";

const MAX_INPUT_BYTES = 100 * 1024;
const RATE_LIMIT = 10; // runs per window per user
const RATE_WINDOW_MS = 60_000;

// In-memory per-process rate limiting is deliberate: the playground is a
// convenience surface and the runner meters real usage against the key.
const recentRuns = new Map<string, number[]>();

function rateLimited(key: string): boolean {
  const now = Date.now();
  const kept = (recentRuns.get(key) ?? []).filter(
    (t) => now - t < RATE_WINDOW_MS,
  );
  if (kept.length >= RATE_LIMIT) {
    recentRuns.set(key, kept);
    return true;
  }
  kept.push(now);
  recentRuns.set(key, kept);
  // Bound the map: drop stale entries once it grows past a soft cap.
  if (recentRuns.size > 10_000) {
    for (const [k, v] of recentRuns) {
      if (v.every((t) => now - t >= RATE_WINDOW_MS)) recentRuns.delete(k);
    }
  }
  return false;
}

function jsonError(status: number, error: string, message: string) {
  return NextResponse.json({ ok: false, error, message, status }, { status });
}

// Resolve (or lazily mint) the signed-in user's playground key, stored
// encrypted in the service-role-only playground_keys table.
async function resolvePlaygroundKey(userId: string): Promise<string> {
  const admin = createAdminClient();

  const { data: row, error } = await admin
    .from("playground_keys")
    .select("api_key_id, key_ciphertext")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`playground_keys read failed: ${error.message}`);

  if (row) {
    const { data: apiKey } = await admin
      .from("api_keys")
      .select("id, revoked_at")
      .eq("id", row.api_key_id)
      .maybeSingle();
    if (apiKey && !apiKey.revoked_at) {
      return decryptPlaygroundKey(row.key_ciphertext);
    }
    // The backing key was revoked (or deleted) — discard and re-mint.
    await admin.from("playground_keys").delete().eq("user_id", userId);
  }

  const { token, hash, prefix } = generateApiKey();
  const { data: inserted, error: keyError } = await admin
    .from("api_keys")
    .insert({
      user_id: userId,
      name: "Playground",
      key_hash: hash,
      key_prefix: prefix,
      kind: "playground",
    })
    .select("id")
    .single();
  if (keyError || !inserted) {
    throw new Error(`playground key insert failed: ${keyError?.message}`);
  }

  const { error: mapError } = await admin.from("playground_keys").upsert(
    {
      user_id: userId,
      api_key_id: inserted.id,
      key_ciphertext: encryptPlaygroundKey(token),
    },
    { onConflict: "user_id" },
  );
  if (mapError) {
    throw new Error(`playground_keys insert failed: ${mapError.message}`);
  }
  return token;
}

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ name: string }> },
) {
  // Two auth paths: the playground UI runs on the session cookie and a
  // server-held per-user key; the documented curl equivalent sends a real
  // bf_ key, which the runner validates and meters directly.
  const authHeader = request.headers.get("authorization") ?? "";
  const bearer = authHeader.startsWith("Bearer bf_")
    ? authHeader.slice("Bearer ".length)
    : null;

  let bfToken: string;
  let rateKey: string;
  if (bearer) {
    bfToken = bearer;
    rateKey = sha256Hex(bearer);
  } else {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return jsonError(401, "unauthorized", "sign in to run tools in the playground");
    }
    if (!playgroundKmsConfigured()) {
      return jsonError(500, "playground_unconfigured", "PLAYGROUND_KMS_KEY is not set");
    }
    rateKey = user.id;
    try {
      bfToken = await resolvePlaygroundKey(user.id);
    } catch (e) {
      console.error("playground key resolution failed:", e);
      return jsonError(500, "playground_key_error", "could not prepare a playground key");
    }
  }

  if (rateLimited(rateKey)) {
    return jsonError(429, "rate_limited", "playground limit is 10 runs per minute — try again shortly");
  }

  const { name } = await ctx.params;
  const tool = await getLiveTool(name);
  if (!tool) {
    return jsonError(404, "tool_not_found", `no live tool named ${name}`);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "bad_request", "body must be JSON: {\"input\": {...}}");
  }
  const input = (body as { input?: unknown } | null)?.input;
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return jsonError(400, "bad_request", "input must be a JSON object");
  }
  if (Buffer.byteLength(JSON.stringify(input), "utf8") > MAX_INPUT_BYTES) {
    return jsonError(400, "bad_request", "input must be 100KB of JSON or less");
  }

  const result = await runTool(tool.name, input, bfToken);
  return NextResponse.json(result, {
    status: result.ok ? 200 : (result.status ?? 502),
  });
}
