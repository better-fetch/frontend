import { NextResponse, type NextRequest } from "next/server";
import { absoluteUrl } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(absoluteUrl("/", request), 303);
}
