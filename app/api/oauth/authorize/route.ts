import { NextResponse, type NextRequest } from "next/server";
import { CODE_TTL_MS, generateAuthorizationCode, getOauthClient, OAUTH_SCOPE } from "@/lib/oauth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Consent form target. Re-validates everything the page validated — the
// form fields are attacker-controllable — then issues the authorization
// code and bounces back to the client.
export async function POST(request: NextRequest) {
  // The consent form is same-origin; a cross-site POST here would let an
  // attacker silently bind a victim's account to their own client.
  const secFetchSite = request.headers.get("sec-fetch-site");
  if (secFetchSite && secFetchSite !== "same-origin") {
    return NextResponse.json({ error: "cross-site request rejected" }, { status: 403 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "not signed in" }, { status: 401 });
  }

  const form = await request.formData();
  const clientId = String(form.get("client_id") ?? "");
  const redirectUri = String(form.get("redirect_uri") ?? "");
  const state = String(form.get("state") ?? "");
  const codeChallenge = String(form.get("code_challenge") ?? "");
  const scope = String(form.get("scope") ?? "") || OAUTH_SCOPE;
  const action = String(form.get("action") ?? "");

  const admin = createAdminClient();
  const client = await getOauthClient(admin, clientId);
  if (!client || !client.redirect_uris.includes(redirectUri)) {
    return NextResponse.json({ error: "invalid client or redirect_uri" }, { status: 400 });
  }

  const target = new URL(redirectUri);
  if (state) target.searchParams.set("state", state);

  if (action !== "approve" || !codeChallenge) {
    target.searchParams.set("error", "access_denied");
    return NextResponse.redirect(target, 303);
  }

  const { code, hash } = generateAuthorizationCode();
  const { error } = await admin.from("oauth_codes").insert({
    code_hash: hash,
    client_id: clientId,
    user_id: user.id,
    redirect_uri: redirectUri,
    code_challenge: codeChallenge,
    scope,
    expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
  });
  if (error) {
    console.error("authorization code insert failed:", error);
    return NextResponse.json({ error: "could not authorize" }, { status: 500 });
  }

  // Expired codes from abandoned flows accumulate; sweep opportunistically.
  await admin.from("oauth_codes").delete().lt("expires_at", new Date().toISOString());

  target.searchParams.set("code", code);
  return NextResponse.redirect(target, 303);
}
