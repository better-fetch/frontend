import { createHash, timingSafeEqual } from "node:crypto";
import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  RESERVED_TOOL_NAMES,
  compareSemver,
  manifestSchema,
  toolNameFromDir,
  toolNameFromRepo,
} from "@/lib/tool-manifest";
import { createAdminClient } from "@/lib/supabase/admin";
import { clearLiveToolsCache } from "@/lib/tools-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// CI-to-platform publish endpoint. Tool repos' pipelines (tool-ci.yml in
// better-fetch/tool-template) POST here after validate/bundle/test pass on
// a main push. Auth is the org-level shared secret — there is no user in
// this flow.

const MAX_BUNDLE_BYTES = 2 * 1024 * 1024;

const payloadSchema = z.object({
  manifest: z.unknown(),
  bundle_b64: z.string().optional(),
  bundle_sha256: z.string().regex(/^[0-9a-f]{64}$/).optional(),
  repo: z.string().regex(/^better-fetch\/[A-Za-z0-9._-]+$/),
  // Monorepo publishes (better-fetch/tools) identify the tool by its
  // directory; single-repo publishes derive the name from the repo itself.
  source_dir: z.string().regex(/^tools\/[A-Za-z0-9._-]+$/).optional(),
  commit_sha: z.string().optional(),
  channel: z.enum(["live", "staging", "delist"]),
});

function authorized(request: NextRequest): boolean {
  const secret = process.env.TOOL_INGEST_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  const presented = createHash("sha256").update(header).digest();
  const expected = createHash("sha256").update(`Bearer ${secret}`).digest();
  return timingSafeEqual(presented, expected);
}

function jsonError(status: number, error: string, detail?: string) {
  return NextResponse.json({ ok: false, error, detail }, { status });
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return jsonError(401, "unauthorized");

  const parsed = payloadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return jsonError(400, "bad_payload", parsed.error.message);
  }
  const { repo, channel, commit_sha, source_dir } = parsed.data;
  const admin = createAdminClient();
  const expectedName = source_dir ? toolNameFromDir(source_dir) : toolNameFromRepo(repo);
  const repoUrl = source_dir
    ? `https://github.com/${repo}/tree/main/${source_dir}`
    : `https://github.com/${repo}`;

  // Delisting needs no manifest — the repo/dir identity is enough.
  if (channel === "delist") {
    const name = expectedName;
    const { error } = await admin
      .from("tools")
      .update({ status: "delisted", updated_at: new Date().toISOString() })
      .eq("name", name);
    if (error) return jsonError(500, "db_error", error.message);
    clearLiveToolsCache();
    revalidatePath("/tools");
    revalidatePath("/");
    revalidatePath("/llms.txt");
    revalidatePath("/sitemap.xml");
    return NextResponse.json({ ok: true, tool: name, status: "delisted" });
  }

  const manifestResult = manifestSchema.safeParse(parsed.data.manifest);
  if (!manifestResult.success) {
    return jsonError(400, "invalid_manifest", manifestResult.error.message);
  }
  const manifest = manifestResult.data;

  if (manifest.name !== expectedName) {
    return jsonError(
      400,
      "name_mismatch",
      `manifest name ${manifest.name} != ${source_dir ? `dir ${source_dir}` : `repo ${repo}`}`,
    );
  }
  if (RESERVED_TOOL_NAMES.has(manifest.name)) {
    return jsonError(400, "reserved_name", manifest.name);
  }
  if (!parsed.data.bundle_b64 || !parsed.data.bundle_sha256) {
    return jsonError(400, "missing_bundle");
  }

  const bundle = Buffer.from(parsed.data.bundle_b64, "base64");
  if (bundle.byteLength === 0 || bundle.byteLength > MAX_BUNDLE_BYTES) {
    return jsonError(400, "bad_bundle_size", `${bundle.byteLength} bytes`);
  }
  const sha = createHash("sha256").update(bundle).digest("hex");
  if (sha !== parsed.data.bundle_sha256) {
    return jsonError(400, "sha_mismatch");
  }

  // Storefront metadata (title, logo, seo, …) is only written by live
  // publishes — a staging publish must not mutate what users currently see.
  // A first-ever publish still creates the row whatever the channel.
  const { data: existing, error: existingError } = await admin
    .from("tools")
    .select("id, status, live_version_id")
    .eq("name", manifest.name)
    .maybeSingle();
  if (existingError) {
    return jsonError(500, "db_error", existingError.message);
  }

  let tool = existing;
  if (!existing || channel === "live") {
    const { data: upserted, error: toolError } = await admin
      .from("tools")
      .upsert(
        {
          name: manifest.name,
          title: manifest.title,
          description: manifest.description,
          category: manifest.category,
          logo_svg: manifest.logo.svg,
          logo_label: manifest.logo.label,
          logo_source_url: manifest.logo.sourceUrl ?? null,
          seo: manifest.seo,
          popularity_rank: manifest.popularity?.rank ?? null,
          popularity_score: manifest.popularity?.score ?? null,
          popularity_source: null,
          popularity_source_url: null,
          benchmark: null,
          credits_estimate: manifest.creditsEstimate,
          repo_url: repoUrl,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "name" },
      )
      .select("id, status, live_version_id")
      .single();
    if (toolError || !upserted) {
      return jsonError(500, "db_error", toolError?.message);
    }
    tool = upserted;
  }
  if (!tool) {
    return jsonError(500, "db_error", "tool row unavailable");
  }

  // Live publishes must move the version forward; a re-run of the same
  // version with the same bundle is an idempotent no-op.
  if (channel === "live" && tool.live_version_id) {
    const { data: liveVersion } = await admin
      .from("tool_versions")
      .select("version, bundle_sha256")
      .eq("id", tool.live_version_id)
      .single();
    if (liveVersion) {
      const cmp = compareSemver(manifest.version, liveVersion.version);
      if (cmp < 0) {
        return jsonError(409, "version_regression", `${manifest.version} < live ${liveVersion.version}`);
      }
      if (cmp === 0 && liveVersion.bundle_sha256 !== sha) {
        return jsonError(409, "version_reuse", `bump the version — ${manifest.version} is already live with different code`);
      }
    }
  }

  // Content-addressed and immutable: identical re-uploads are fine to skip.
  const bundlePath = `${manifest.name}/${manifest.version}/${sha}.mjs`;
  const { error: uploadError } = await admin.storage
    .from("tool-bundles")
    .upload(bundlePath, bundle, { contentType: "text/javascript", upsert: false });
  if (uploadError && !/already exists/i.test(uploadError.message)) {
    return jsonError(500, "storage_error", uploadError.message);
  }

  const { data: version, error: versionError } = await admin
    .from("tool_versions")
    .upsert(
      {
        tool_id: tool.id,
        version: manifest.version,
        manifest,
        input_schema: manifest.inputSchema,
        output_schema: manifest.outputSchema ?? null,
        examples: manifest.examples,
        bundle_path: bundlePath,
        bundle_sha256: sha,
        commit_sha: commit_sha ?? null,
      },
      { onConflict: "tool_id,version" },
    )
    .select("id")
    .single();
  if (versionError || !version) {
    return jsonError(500, "db_error", versionError?.message);
  }

  const pointer =
    channel === "live"
      ? {
          live_version_id: version.id,
          status: "live",
          validated_at: new Date().toISOString(),
        }
      : {
          staging_version_id: version.id,
          validated_at: new Date().toISOString(),
        };
  const { error: pointerError } = await admin
    .from("tools")
    .update({ ...pointer, updated_at: new Date().toISOString() })
    .eq("id", tool.id);
  if (pointerError) return jsonError(500, "db_error", pointerError.message);

  clearLiveToolsCache();
  revalidatePath("/tools");
  revalidatePath(`/tools/${manifest.name}`);
  revalidatePath("/");
  revalidatePath("/llms.txt");
  revalidatePath("/sitemap.xml");

  return NextResponse.json({
    ok: true,
    tool: manifest.name,
    version: manifest.version,
    channel,
  });
}
