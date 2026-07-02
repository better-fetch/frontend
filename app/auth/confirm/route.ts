import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { absoluteUrl } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";

// Lands here from the magic-link email. Default Supabase templates send a
// PKCE `code`; customized templates may send `token_hash` + `type`. Handle
// both so the email template never has to change.
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  // Same-origin paths only — `next` arrives via the magic-link email and
  // must never become an open redirect. /oauth/authorize uses this to
  // resume a pending connector authorization after sign-in.
  const rawNext = searchParams.get("next") ?? "";
  const next =
    rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/keys";

  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(absoluteUrl(next, request));
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(absoluteUrl(next, request));
  }

  return NextResponse.redirect(absoluteUrl("/login?error=link", request));
}
