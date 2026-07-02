import "server-only";

import { createClient } from "@supabase/supabase-js";

// Service-role client: bypasses RLS. Route handlers must resolve the user
// from the session cookie first and scope every write to that user_id.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
