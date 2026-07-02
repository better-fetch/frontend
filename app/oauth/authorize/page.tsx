import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getOauthClient, OAUTH_SCOPE } from "@/lib/oauth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getClaims } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Authorize access",
  robots: { index: false },
};

type Params = { [key: string]: string | string[] | undefined };

function first(params: Params, key: string): string {
  const value = params[key];
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

// OAuth 2.1 authorization endpoint (consent screen). Claude and other MCP
// clients land here after dynamic registration; approving issues a
// short-lived code that /api/oauth/token exchanges for an API key.
export default async function AuthorizePage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const params = await searchParams;
  const clientId = first(params, "client_id");
  const redirectUri = first(params, "redirect_uri");
  const state = first(params, "state");
  const codeChallenge = first(params, "code_challenge");
  const codeChallengeMethod = first(params, "code_challenge_method") || "S256";
  const scope = first(params, "scope") || OAUTH_SCOPE;

  // Per spec: an unknown client or unregistered redirect_uri must never be
  // redirected to — render the error instead.
  const client = clientId ? await getOauthClient(createAdminClient(), clientId) : null;
  if (!client || !client.redirect_uris.includes(redirectUri)) {
    return (
      <ErrorCard
        title="Invalid authorization request"
        detail={
          !client
            ? "Unknown client_id. The application may need to re-register."
            : "The redirect_uri is not registered for this client."
        }
      />
    );
  }

  const deny = (error: string, description: string) => {
    const url = new URL(redirectUri);
    url.searchParams.set("error", error);
    url.searchParams.set("error_description", description);
    if (state) url.searchParams.set("state", state);
    redirect(url.toString());
  };

  if (first(params, "response_type") !== "code") {
    deny("unsupported_response_type", "only response_type=code is supported");
  }
  if (!codeChallenge || codeChallengeMethod !== "S256") {
    deny("invalid_request", "PKCE with code_challenge_method=S256 is required");
  }

  const claims = await getClaims();
  if (!claims) {
    const here = `/oauth/authorize?${new URLSearchParams(
      Object.entries(params).flatMap(([k, v]) =>
        typeof v === "string" ? [[k, v] as [string, string]] : [],
      ),
    )}`;
    redirect(`/login?next=${encodeURIComponent(here)}`);
  }

  return (
    <div className="flex justify-center pt-12">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Authorize {client.client_name}</CardTitle>
          <CardDescription>
            <strong>{client.client_name}</strong> is asking to use Better Fetch
            on behalf of <strong>{claims.email as string}</strong>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Fetch pages, JSON APIs, and screenshots through your account</li>
            <li>Calls are metered against your plan, like any API key</li>
            <li>
              A key named “{client.client_name} (MCP connector)” will appear on
              your keys page — revoke it there to disconnect at any time
            </li>
          </ul>
          <form method="POST" action="/api/oauth/authorize" className="flex gap-2">
            <input type="hidden" name="client_id" value={client.client_id} />
            <input type="hidden" name="redirect_uri" value={redirectUri} />
            <input type="hidden" name="state" value={state} />
            <input type="hidden" name="code_challenge" value={codeChallenge} />
            <input type="hidden" name="scope" value={scope} />
            <Button type="submit" name="action" value="approve" className="flex-1">
              Approve
            </Button>
            <Button
              type="submit"
              name="action"
              value="deny"
              variant="outline"
              className="flex-1"
            >
              Deny
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function ErrorCard({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex justify-center pt-12">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{detail}</CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
