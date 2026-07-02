import "server-only";

import { createHash } from "node:crypto";
import { cache } from "react";
import { z } from "zod";

// Posts live in a separate content repo (BLOG_REPO) under posts/*.md with
// strict frontmatter — see that repo's README for the publishing contract.
// Fetches are tagged so /api/revalidate can bust them the moment the content
// repo pushes; the time-based revalidate is only a safety net.

export const BLOG_CACHE_TAG = "blog";
const REVALIDATE_SECONDS = 21600;

const REPO = process.env.BLOG_REPO ?? "PaulCrossland1/betterfetch-blog";
const BRANCH = process.env.BLOG_BRANCH ?? "main";
const TOKEN = process.env.BLOG_GITHUB_TOKEN;

const frontmatterSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  author: z.string().min(1).default("Better Fetch"),
  slug: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .optional(),
  published: z.enum(["true", "false"]).default("true"),
});

export type BlogPost = {
  slug: string;
  title: string;
  description: string;
  date: string;
  author: string;
  // SHA-256 of the raw file — seeds the generated card art, so the art
  // changes whenever the post does.
  hash: string;
  content: string;
};

// Minimal frontmatter parser for the strict `key: value` contract — no YAML
// nesting, no multiline values. Anything else fails validation and the post
// is skipped rather than crashing the route.
function parseFrontmatter(
  raw: string,
): { data: Record<string, string>; body: string } | null {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return null;
  const data: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const colon = line.indexOf(":");
    if (colon === -1) return null;
    const key = line.slice(0, colon).trim();
    const value = line
      .slice(colon + 1)
      .trim()
      .replace(/^["'](.*)["']$/, "$1");
    data[key] = value;
  }
  return { data, body: match[2] };
}

function toPost(filename: string, raw: string): BlogPost | null {
  const parsed = parseFrontmatter(raw);
  if (!parsed) {
    console.warn(`blog: ${filename} has no frontmatter block, skipping`);
    return null;
  }
  const result = frontmatterSchema.safeParse(parsed.data);
  if (!result.success) {
    console.warn(`blog: ${filename} failed validation, skipping`, result.error.issues);
    return null;
  }
  const fm = result.data;
  if (fm.published === "false") return null;
  return {
    slug:
      fm.slug ??
      filename.replace(/\.md$/, "").replace(/^\d{4}-\d{2}-\d{2}-/, ""),
    title: fm.title,
    description: fm.description,
    date: fm.date,
    author: fm.author,
    hash: createHash("sha256").update(raw).digest("hex"),
    content: parsed.body,
  };
}

function ghHeaders(accept: string): HeadersInit {
  return {
    Accept: accept,
    // GitHub rejects requests without a User-Agent.
    "User-Agent": "betterfetch-web",
    ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
  };
}

async function fetchPostFiles(): Promise<{ name: string; raw: string }[]> {
  // Local preview mode: point BLOG_LOCAL_DIR at a posts/ directory to write
  // and preview posts without pushing to the content repo.
  const localDir = process.env.BLOG_LOCAL_DIR;
  if (localDir) {
    const { readdir, readFile } = await import("node:fs/promises");
    const names = (await readdir(localDir)).filter((n) => n.endsWith(".md"));
    return Promise.all(
      names.map(async (name) => ({
        name,
        raw: await readFile(`${localDir}/${name}`, "utf-8"),
      })),
    );
  }

  const base = `https://api.github.com/repos/${REPO}/contents/posts`;
  const listing = await fetch(`${base}?ref=${BRANCH}`, {
    headers: ghHeaders("application/vnd.github+json"),
    next: { tags: [BLOG_CACHE_TAG], revalidate: REVALIDATE_SECONDS },
  });
  if (!listing.ok) {
    throw new Error(`blog: listing ${REPO}/posts failed (${listing.status})`);
  }
  const entries = (await listing.json()) as { name: string; type: string }[];
  return Promise.all(
    entries
      .filter((e) => e.type === "file" && e.name.endsWith(".md"))
      .map(async ({ name }) => {
        const res = await fetch(`${base}/${encodeURIComponent(name)}?ref=${BRANCH}`, {
          headers: ghHeaders("application/vnd.github.raw+json"),
          next: { tags: [BLOG_CACHE_TAG], revalidate: REVALIDATE_SECONDS },
        });
        if (!res.ok) {
          throw new Error(`blog: fetching ${name} failed (${res.status})`);
        }
        return { name, raw: await res.text() };
      }),
  );
}

// Newest first. A content-repo outage degrades to an empty list (the index
// shows its empty state) instead of a 500 — the data cache means this only
// happens when there's no previously cached copy at all.
export const listPosts = cache(async (): Promise<BlogPost[]> => {
  let files: { name: string; raw: string }[];
  try {
    files = await fetchPostFiles();
  } catch (error) {
    console.warn(error);
    return [];
  }
  return files
    .map(({ name, raw }) => toPost(name, raw))
    .filter((post): post is BlogPost => post !== null)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
});

export const getPost = cache(async (slug: string): Promise<BlogPost | null> => {
  return (await listPosts()).find((post) => post.slug === slug) ?? null;
});

export function formatPostDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}
