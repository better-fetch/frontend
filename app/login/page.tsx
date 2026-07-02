"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  return (
    // useSearchParams must sit under a Suspense boundary for the static build.
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Where to land after sign-in: same-origin paths only, so the magic link
  // can't be turned into an open redirect. The OAuth consent page uses this
  // to resume an authorization request.
  const rawNext = useSearchParams().get("next") ?? "";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "";

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const confirmUrl = new URL("/auth/confirm", location.origin);
    if (next) confirmUrl.searchParams.set("next", next);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: confirmUrl.toString() },
    });
    setBusy(false);
    if (error) setError(error.message);
    else setSent(true);
  }

  return (
    <div className="flex justify-center pt-12">
      <Card className="w-full max-w-sm">
        {sent ? (
          <CardHeader>
            <CardTitle>Check your email</CardTitle>
            <CardDescription>
              We sent a sign-in link to <strong>{email}</strong>. Click it to
              continue — you can close this tab.
            </CardDescription>
          </CardHeader>
        ) : (
          <>
            <CardHeader>
              <CardTitle>Sign in</CardTitle>
              <CardDescription>
                We&apos;ll email you a sign-in link — no password needed. New
                here? The same link creates your account.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={sendLink} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    required
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy ? "Sending…" : "Send sign-in link"}
                </Button>
                {error ? (
                  <p className="text-sm text-destructive">{error}</p>
                ) : null}
              </form>
            </CardContent>
          </>
        )}
      </Card>
    </div>
  );
}
