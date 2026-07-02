import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

// Resend Inbound → Slack. Resend POSTs an `email.received` event here when
// mail arrives at betterfetch.co; we verify it and post a summary to the
// same channel as the signup/first-call alerts.
export const runtime = "nodejs";

// Inbound mail goes to its own channel, distinct from the signup/first-call
// alerts (C0BADG54ELR). Overridable via env; default keeps it correct even
// if the Fly env var is unset.
const SLACK_CHANNEL =
  process.env.SLACK_CHANNEL_INBOUND_CHANNEL ?? "C0BA5GULC7M";
const MAX_BODY_CHARS = 3000;
const TOLERANCE_SECONDS = 300;

type InboundEvent = {
  type: string;
  data: {
    email_id: string;
    from: string;
    to?: string[];
    subject?: string;
    attachments?: { filename: string }[];
    text?: string;
    html?: string;
    [key: string]: unknown;
  };
};

// Resend signs webhooks with the Svix scheme: HMAC-SHA256 over
// `${id}.${timestamp}.${body}`, keyed by the base64 secret after the
// "whsec_" prefix. svix-signature is a space-separated list of "v1,<sig>".
function verify(
  secret: string,
  id: string,
  timestamp: string,
  body: string,
  header: string,
): boolean {
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key)
    .update(`${id}.${timestamp}.${body}`)
    .digest("base64");
  const expectedBuf = Buffer.from(expected);
  for (const entry of header.split(" ")) {
    const sig = entry.split(",")[1];
    if (!sig) continue;
    const sigBuf = Buffer.from(sig);
    if (sigBuf.length === expectedBuf.length && timingSafeEqual(sigBuf, expectedBuf)) {
      return true;
    }
  }
  return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<(br|\/p|\/div|\/li)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function normalizeBody(text: string): string | null {
  const normalized = text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!normalized) return null;
  const clipped =
    normalized.length > MAX_BODY_CHARS
      ? `${normalized.slice(0, MAX_BODY_CHARS).trimEnd()}\n...`
      : normalized;
  return clipped.replace(/```/g, "'''");
}

function recordsFrom(value: unknown): Record<string, unknown>[] {
  if (!isRecord(value)) return [];
  const records = [value];
  for (const key of ["data", "email", "message", "body", "content"]) {
    const nested = value[key];
    if (isRecord(nested)) records.push(nested);
  }
  return records;
}

function pickString(
  records: Record<string, unknown>[],
  keys: string[],
): string | null {
  for (const record of records) {
    for (const key of keys) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) return value;
    }
  }
  return null;
}

function extractBody(value: unknown): string | null {
  const records = recordsFrom(value);
  const text = pickString(records, [
    "text",
    "plain",
    "plaintext",
    "text_body",
    "body_text",
    "raw_text",
    "body",
  ]);
  if (text) return normalizeBody(text);

  const html = pickString(records, [
    "html",
    "html_body",
    "body_html",
    "raw_html",
  ]);
  if (html) return normalizeBody(htmlToText(html));

  const preview = pickString(records, ["snippet", "preview", "summary"]);
  return preview ? normalizeBody(preview) : null;
}

// Best-effort: some Resend inbound webhooks include body fields directly,
// while others only include metadata and need an API lookup. Any failure
// degrades to a metadata-only alert rather than making Resend retry.
async function fetchEmailBody(emailId: string): Promise<string | null> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  const urls = [
    `https://api.resend.com/emails/received/${emailId}`,
    `https://api.resend.com/emails/${emailId}`,
  ];
  try {
    for (const url of urls) {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (!res.ok) {
        console.warn(`inbound: body fetch ${res.status} for ${url}`);
        continue;
      }
      const body = extractBody(await res.json());
      if (body) return body;
      console.warn(`inbound: body fetch had no readable body for ${url}`);
    }
  } catch (err) {
    console.warn("inbound: body fetch failed", err);
  }
  return null;
}

export async function POST(request: NextRequest) {
  const secret = process.env.RESEND_INBOUND_SECRET;
  const slackToken = process.env.SLACK_BOT_TOKEN;
  if (!secret || !slackToken) {
    console.error("inbound: RESEND_INBOUND_SECRET or SLACK_BOT_TOKEN not set");
    return NextResponse.json({ error: "not configured" }, { status: 500 });
  }

  const body = await request.text();
  const id = request.headers.get("svix-id");
  const timestamp = request.headers.get("svix-timestamp");
  const signature = request.headers.get("svix-signature");
  if (!id || !timestamp || !signature) {
    return NextResponse.json({ error: "missing signature headers" }, { status: 400 });
  }

  // Replay guard.
  const tsSeconds = Number(timestamp);
  if (
    !Number.isFinite(tsSeconds) ||
    Math.abs(Date.now() / 1000 - tsSeconds) > TOLERANCE_SECONDS
  ) {
    return NextResponse.json({ error: "stale timestamp" }, { status: 400 });
  }

  if (!verify(secret, id, timestamp, body, signature)) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }

  const event = JSON.parse(body) as InboundEvent;
  if (event.type !== "email.received") {
    return NextResponse.json({ received: true, ignored: event.type });
  }

  const { email_id, from, to, subject, attachments } = event.data;
  const emailBody = extractBody(event.data) ?? await fetchEmailBody(email_id);

  const lines = [
    `:envelope_with_arrow: *New email* to ${to?.join(", ") || "betterfetch.co"}`,
    `*From:* ${from}`,
    `*Subject:* ${subject || "(no subject)"}`,
  ];
  if (attachments?.length) {
    lines.push(`:paperclip: ${attachments.length} attachment(s)`);
  }
  if (emailBody) {
    lines.push("", "*Body:*", "```", emailBody, "```");
  }

  const slackRes = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${slackToken}`,
    },
    body: JSON.stringify({
      channel: SLACK_CHANNEL,
      text: lines.join("\n"),
      unfurl_links: false,
    }),
  });
  const slackJson = (await slackRes.json()) as { ok: boolean; error?: string };
  // Return 200 regardless so Resend doesn't retry on a Slack-side issue
  // (e.g. not_in_channel) — log it for us instead.
  if (!slackJson.ok) {
    console.error(`inbound: slack post failed: ${slackJson.error}`);
  }
  return NextResponse.json({ received: true });
}
