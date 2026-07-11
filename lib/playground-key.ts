import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Per-user playground API keys are stored encrypted at rest in the
// service-role-only playground_keys table. AES-256-GCM under the
// PLAYGROUND_KMS_KEY env var (32 bytes as 64 hex chars); the ciphertext
// column holds base64(iv[12] || ciphertext || tag[16]).

const IV_BYTES = 12;
const TAG_BYTES = 16;

function kmsKey(): Buffer {
  const hex = process.env.PLAYGROUND_KMS_KEY;
  if (!hex || !/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error("PLAYGROUND_KMS_KEY must be 32 bytes of hex");
  }
  return Buffer.from(hex, "hex");
}

export function playgroundKmsConfigured(): boolean {
  const hex = process.env.PLAYGROUND_KMS_KEY;
  return Boolean(hex && /^[0-9a-fA-F]{64}$/.test(hex));
}

export function encryptPlaygroundKey(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", kmsKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, ciphertext, cipher.getAuthTag()]).toString("base64");
}

export function decryptPlaygroundKey(encoded: string): string {
  const raw = Buffer.from(encoded, "base64");
  if (raw.byteLength <= IV_BYTES + TAG_BYTES) {
    throw new Error("playground key ciphertext is too short");
  }
  const iv = raw.subarray(0, IV_BYTES);
  const ciphertext = raw.subarray(IV_BYTES, raw.byteLength - TAG_BYTES);
  const tag = raw.subarray(raw.byteLength - TAG_BYTES);
  const decipher = createDecipheriv("aes-256-gcm", kmsKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString(
    "utf8",
  );
}
