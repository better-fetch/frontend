import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// Weekly belt-and-braces reconciliation: the registry must remain a pure
// function of the org's repos. CI delists on archive when its workflow runs,
// but a repo deleted or archived without a final workflow run would linger —
// this sweep catches those. Tool repos are public, so no GitHub token needed.

export async function GET(request: NextRequest) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: tools, error } = await admin
    .from("tools")
    .select("id, name, repo_url, status")
    .neq("status", "delisted");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const delisted: string[] = [];
  for (const tool of tools ?? []) {
    const repo = tool.repo_url.replace("https://github.com/", "");
    const res = await fetch(`https://api.github.com/repos/${repo}`, {
      headers: { Accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(10_000),
    });
    // Rate-limited or transient error → skip, never delist on uncertainty.
    if (res.status === 404) {
      delisted.push(tool.name);
    } else if (res.ok) {
      const info = (await res.json()) as { archived?: boolean };
      if (info.archived) delisted.push(tool.name);
    }
  }

  if (delisted.length) {
    const { error: updateError } = await admin
      .from("tools")
      .update({ status: "delisted", updated_at: new Date().toISOString() })
      .in("name", delisted);
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }
    revalidatePath("/tools");
    revalidatePath("/");
  }

  return NextResponse.json({ ok: true, checked: tools?.length ?? 0, delisted });
}
