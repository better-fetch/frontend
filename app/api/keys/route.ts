import { NextResponse, type NextRequest } from "next/server";
import { generateApiKey } from "@/lib/keys";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const MAX_ACTIVE_KEYS = 10;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "not signed in" }, { status: 401 });
  }

  let name = "default";
  try {
    const body = await request.json();
    if (typeof body?.name === "string" && body.name.trim()) {
      name = body.name.trim().slice(0, 64);
    }
  } catch {
    // empty body is fine — use the default name
  }

  const admin = createAdminClient();

  const { count } = await admin
    .from("api_keys")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .is("revoked_at", null);
  if ((count ?? 0) >= MAX_ACTIVE_KEYS) {
    return NextResponse.json(
      { error: `limit of ${MAX_ACTIVE_KEYS} active keys reached` },
      { status: 400 },
    );
  }

  const { token, hash, prefix } = generateApiKey();
  const { error } = await admin.from("api_keys").insert({
    user_id: user.id,
    name,
    key_hash: hash,
    key_prefix: prefix,
  });
  if (error) {
    console.error("key insert failed:", error);
    return NextResponse.json({ error: "could not create key" }, { status: 500 });
  }

  // The plaintext token leaves the server exactly once, here.
  return NextResponse.json({ token, prefix, name });
}
