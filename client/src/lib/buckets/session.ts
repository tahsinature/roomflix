// In-memory cache of fetched secrets, keyed by connection id. Cleared
// on logout (callers can also call `clearAllSecrets` for force-reset).
//
// The old single-connection localStorage cache is gone — the new model
// has many connections per user, and persistent secrets in localStorage
// are exactly the threat we built the ECDH endpoint to mitigate. Always
// fetch from the server when needed; secrets live only in JS memory.
import type { Connection } from "@/lib/buckets/types";
import type { StorageConnection } from "@shared/protocol";
import { fetchSecret } from "@/lib/secureFetch";

const secretCache = new Map<string, string>();

// Returns a Connection (full record incl. secret) for the given
// connection summary, fetching the secret via ECDH if it's not already
// cached. The cache lasts for the lifetime of the JS context.
export async function loadFullConnection(summary: StorageConnection): Promise<Connection> {
  let secret = secretCache.get(summary.id);
  if (!secret) {
    secret = await fetchSecret(`/api/storage/secret/${encodeURIComponent(summary.id)}`);
    secretCache.set(summary.id, secret);
  }
  return summaryToConnection(summary, secret);
}

// Invalidate the cached secret for one connection. Call after PATCH
// updates that rotate the key — the cached entry would otherwise serve
// a stale cred until the page reloads.
export function invalidateSecret(connectionId: string): void {
  secretCache.delete(connectionId);
}

// Clear every cached secret. Used on logout so a subsequent login as a
// different user can't see the previous user's cached creds.
export function clearAllSecrets(): void {
  secretCache.clear();
}

function summaryToConnection(s: StorageConnection, secret: string): Connection {
  return {
    provider: s.provider,
    accountId: s.accountId,
    accessKeyId: s.accessKeyId,
    secretAccessKey: secret,
    bucket: s.bucket,
    publicBaseUrl: s.publicBaseUrl,
    maxBytes: s.maxBytes,
    label: s.label,
  };
}
