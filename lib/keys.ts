import "server-only";

import { createHash, randomBytes } from "crypto";

const ALPHABET =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

// 43 base62 chars of 32 random bytes (~256 bits of entropy). Also used for
// OAuth authorization codes and refresh tokens (lib/oauth.ts).
export function randomBase62(): string {
  const bytes = randomBytes(32);
  let n = BigInt("0x" + bytes.toString("hex"));
  let body = "";
  while (n > 0n) {
    body = ALPHABET[Number(n % 62n)] + body;
    n /= 62n;
  }
  return body;
}

// The plaintext token is shown to the user exactly once; only the
// sha256 hex digest is stored, matching what the backend hashes.
export function generateApiKey(): {
  token: string;
  hash: string;
  prefix: string;
} {
  const token = "bf_" + randomBase62();
  return { token, hash: sha256Hex(token), prefix: token.slice(0, 10) };
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
