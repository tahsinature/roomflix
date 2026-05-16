// Client side of the ECDH secret exchange. Used to fetch storage
// connection secrets without exposing them in the Network tab.
//
// Each call generates a fresh ephemeral P-256 keypair, sends the
// public half to the server, then derives the same shared AES-GCM key
// the server used to encrypt the response. The cleartext lives only
// in JS memory after this returns.
//
// This does NOT protect against a logged-in user with DevTools — they
// can hook the page's JS and read the cleartext. It only addresses
// passive network-tab visibility (raw bytes are opaque ciphertext).
import type { EcdhPublicJwk, SecretExchangeResponse } from "@shared/protocol";

const ALGO = { name: "ECDH", namedCurve: "P-256" } as const;

// POST `path` with a body that bundles a fresh client public key.
// Server returns the standard SecretExchangeResponse envelope; this
// helper decrypts it and gives back the cleartext string.
//
// `extraBody` lets the caller attach additional fields to the request
// (e.g. an id) — they're merged alongside `clientPub`.
export async function fetchSecret(path: string, extraBody?: Record<string, unknown>): Promise<string> {
  const subtle = window.crypto.subtle;
  const myKeys = await subtle.generateKey(ALGO, true, ["deriveBits"]);
  const myPub = (await subtle.exportKey("jwk", myKeys.publicKey)) as unknown as EcdhPublicJwk;

  const res = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...(extraBody ?? {}), clientPub: myPub }),
  });
  if (!res.ok) {
    // Mirror the api helper's error-extraction so error messages are
    // consistent with the rest of the app's network errors.
    const text = await res.text().catch(() => "");
    let message = text || `${res.status} ${res.statusText}`;
    try {
      const body = JSON.parse(text) as { error?: unknown };
      if (typeof body?.error === "string" && body.error.trim()) message = body.error;
    } catch {
      // not JSON; keep raw
    }
    throw new Error(message);
  }
  const env = (await res.json()) as SecretExchangeResponse;

  const serverPub = await subtle.importKey("jwk", env.serverPub as unknown as JsonWebKey, ALGO, false, []);
  const sharedBits = await subtle.deriveBits({ name: "ECDH", public: serverPub }, myKeys.privateKey, 256);
  const aesKey = await subtle.importKey("raw", sharedBits, { name: "AES-GCM" }, false, ["decrypt"]);
  const iv = base64ToBytes(env.iv);
  const cipher = base64ToBytes(env.ciphertext);
  const plaintext = await subtle.decrypt({ name: "AES-GCM", iv }, aesKey, cipher);
  return new TextDecoder().decode(plaintext);
}

// Returns Uint8Array<ArrayBuffer> (vs. the default <ArrayBufferLike>)
// by allocating a concrete ArrayBuffer first. This narrower type
// flows into SubtleCrypto APIs (`subtle.decrypt`, AesGcmParams.iv)
// which require `BufferSource` — TS 5.7+ won't accept ArrayBufferLike
// there because SharedArrayBuffer can't satisfy the contract.
function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
