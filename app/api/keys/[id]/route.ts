import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

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
  const admin = createAdminClient();
  // Scoped to the session user: someone else's key id is a silent no-op.
  const { data, error } = await admin
    .from("api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id)
    .is("revoked_at", null)
    .select("id");

  if (error) {
    console.error("key revoke failed:", error);
    return NextResponse.json({ error: "could not revoke key" }, { status: 500 });
  }
  if (!data?.length) {
    return NextResponse.json({ error: "key not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
