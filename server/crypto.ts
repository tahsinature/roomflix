import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// AES-256-GCM with a server-held key, used for fields that must round-trip
// (R2 secret access keys, etc.) — not for password hashes. Output is a
// versioned `v1.<iv>.<ciphertext_and_tag>` envelope so a future key
// rotation can branch on the prefix.
const VERSION = "v1";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("ENCRYPTION_KEY is required — generate one with `openssl rand -base64 32` and set it in .env");
  }
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) {
    throw new Error(`ENCRYPTION_KEY must be 32 bytes once base64-decoded (got ${buf.length}); regenerate with \`openssl rand -base64 32\``);
  }
  cachedKey = buf;
  return buf;
}

// Validate the key at startup so we fail fast rather than at the first
// write. Called from server/index.ts alongside MONGO_URL.
export function assertEncryptionKey(): void {
  getKey();
}

export function encrypt(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // ciphertext || tag — one base64 chunk keeps the envelope short.
  return `${VERSION}.${iv.toString("base64")}.${Buffer.concat([enc, tag]).toString("base64")}`;
}

export function decrypt(envelope: string): string {
  const parts = envelope.split(".");
  if (parts.length !== 3 || parts[0] !== VERSION) {
    throw new Error("unrecognized ciphertext envelope");
  }
  const iv = Buffer.from(parts[1]!, "base64");
  const blob = Buffer.from(parts[2]!, "base64");
  if (blob.length < TAG_LENGTH) throw new Error("ciphertext too short");
  const ciphertext = blob.subarray(0, blob.length - TAG_LENGTH);
  const tag = blob.subarray(blob.length - TAG_LENGTH);
  const decipher = createDecipheriv("aes-256-gcm", getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
