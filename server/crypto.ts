import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { EcdhPublicJwk, SecretExchangeResponse } from "@/protocol.ts";

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

// ── ECDH wire-encryption ──────────────────────────────────────────────
//
// Used by the storage secret-exchange endpoint. The client generates an
// ephemeral P-256 keypair on every fetch and sends the public half;
// the server does the same on its side, derives the shared secret via
// ECDH, uses it as an AES-256-GCM key, and returns the encrypted
// payload + its own public half. The client recombines to derive the
// same key and decrypt.
//
// Why ephemeral: it means no persistent symmetric secret is shared
// between the parties. A network observer sees only one-shot public
// keys and opaque ciphertext per exchange; reading the cleartext
// requires either party's ephemeral private key, which never leaves
// process memory and is discarded after the single request.
//
// This does NOT defend against a logged-in user with DevTools running
// JS on the page — they can hook into the decryption step and read
// the cleartext from memory. That's a separate hardening task
// (server-side proxying / presigned URLs). For now it only addresses
// the network tab visibility.

// Encrypt `plaintext` for a client given the client's ephemeral public
// JWK. Returns the wire shape directly.
export async function encryptForClient(plaintext: string, clientPubJwk: EcdhPublicJwk): Promise<SecretExchangeResponse> {
  const subtle = globalThis.crypto.subtle;
  // JWK overload of importKey expects DOM's JsonWebKey type which isn't
  // in scope here (server tsconfig doesn't load lib.dom). Our EcdhPublicJwk
  // shape is JWK-compatible — cast through `any` only at this boundary.
  const clientPub = await subtle.importKey(
    "jwk",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    clientPubJwk as any,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const serverKeys = await subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );
  const sharedBits = await subtle.deriveBits(
    { name: "ECDH", public: clientPub },
    serverKeys.privateKey,
    256,
  );
  const aesKey = await subtle.importKey(
    "raw",
    sharedBits,
    { name: "AES-GCM" },
    false,
    ["encrypt"],
  );
  const iv = randomBytes(IV_LENGTH);
  const ciphertext = await subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    new TextEncoder().encode(plaintext),
  );
  // exportKey("jwk", ...) returns a JsonWebKey (DOM type) — same scope
  // issue as the import cast above. Shape matches EcdhPublicJwk for our
  // P-256 keypair so this is structurally safe.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const serverPubJwk = (await subtle.exportKey("jwk", serverKeys.publicKey)) as any as EcdhPublicJwk;
  return {
    iv: Buffer.from(iv).toString("base64"),
    ciphertext: Buffer.from(ciphertext).toString("base64"),
    serverPub: serverPubJwk,
  };
}
