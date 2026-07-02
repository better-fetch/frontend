import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const API_BASE = process.env.BETTER_FETCH_API_URL ?? "https://api.betterfetch.co";
const BACKEND_ADMIN_KEY = process.env.BETTER_FETCH_API_KEY;

async function clearViaBackend(id: string, userId: string) {
  if (!BACKEND_ADMIN_KEY) return false;
  try {
    const response = await fetch(`${API_BASE}/v1/sessions/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${BACKEND_ADMIN_KEY}`,
        "X-Better-Fetch-User-Id": userId,
      },
      signal: AbortSignal.timeout(30_000),
    });
    if (response.ok) return true;
    const text = await response.text();
    console.error("backend session cleanup failed:", response.status, text);
  } catch (error) {
    console.error("backend session cleanup failed:", error);
  }
  return false;
}

export async function DELETE(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "not signed in" }, { status: 401 });
  }

  const { id } = await ctx.params;
  if (await clearViaBackend(id, user.id)) {
    return NextResponse.json({ ok: true });
  }

  // Backward-compatible fallback for local/dev environments that have not
  // shared the backend static ops key with the frontend. This revokes the
  // portable snapshot, but only the backend cleanup path can close an already
  // warm browser context on the serving machine.
  const now = new Date().toISOString();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("browser_sessions")
    .update({ revoked_at: now, deleted_at: now })
    .eq("id", id)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .select("id, snapshot_bucket, snapshot_path")
    .maybeSingle();

  if (error) {
    console.error("session revoke failed:", error);
    return NextResponse.json({ error: "could not clear session" }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "session not found" }, { status: 404 });
  }
  if (data.snapshot_path) {
    const bucket =
      data.snapshot_bucket ||
      process.env.BETTER_FETCH_SESSION_SNAPSHOT_BUCKET ||
      "better-fetch-browser-sessions";
    const { error: storageError } = await admin.storage
      .from(bucket)
      .remove([data.snapshot_path]);
    if (storageError) {
      console.error("session snapshot delete failed:", storageError);
    }
  }
  return NextResponse.json({ ok: true });
}
