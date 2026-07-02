import "server-only";

// Transactional email via the Resend HTTP API. RESEND_API_KEY is the Resend
// credential (the same value Resend uses as the SMTP password). Sender is on
// the verified betterfetch.co domain.
const FROM = process.env.EMAIL_FROM ?? "Better Fetch <no-reply@betterfetch.co>";

export async function sendEmail(
  to: string,
  subject: string,
  html: string,
): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY not set");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: FROM, to, subject, html }),
  });
  if (!res.ok) {
    throw new Error(`resend ${res.status}: ${await res.text()}`);
  }
}
