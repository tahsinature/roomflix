// Persistence for the active storage connection. Two-tier:
//
//   • localStorage caches the connection so the Storage page paints
//     immediately on reload (the bucket browser is unusable until we have
//     credentials, so an async server fetch would mean a loading flash).
//   • The server-side store (DB-backed, encrypted at rest) is the
//     authoritative copy — the import pipeline reads from it to upload
//     YouTube downloads on the user's behalf.
//
// Writes go to both. Reads prefer the cache for sync access; an async
// reconcile keeps the cache in sync with the server.
import type { StorageConfig } from "@shared/protocol";
import { api } from "@/lib/api";
import type { Connection } from "@/lib/buckets/types";

const KEY = "roomflix.bucket.connection.v1";
const LEGACY_SESSION_KEY = KEY;

// Synchronous cache read for the very first render. May be stale relative
// to the server — the caller should also kick off a reconcile.
export function loadConnection(): Connection | null {
  try {
    sessionStorage.removeItem(LEGACY_SESSION_KEY);
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Connection;
    return isValidConnection(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

// Persist locally AND push to the server. If the network write fails, the
// local cache is still updated — losing config to a transient hiccup
// would be more confusing than running with a temporary divergence. The
// caller can re-trigger the push by calling saveConnection again.
export async function saveConnection(conn: Connection): Promise<void> {
  localStorage.setItem(KEY, JSON.stringify(conn));
  try {
    await api.putStorageConfig(toServerShape(conn));
  } catch (err) {
    console.warn("[roomflix] storage config save: server write failed", err);
  }
}

export async function clearConnection(): Promise<void> {
  localStorage.removeItem(KEY);
  sessionStorage.removeItem(LEGACY_SESSION_KEY);
  try {
    await api.deleteStorageConfig();
  } catch {
    // Best-effort. If the server still has the row, the next saveConnection
    // will overwrite it.
  }
}

// Reconcile local cache with the server. Three cases:
//   • server has config, local doesn't  → adopt server's
//   • local has config, server doesn't  → push local up (first-time
//     migration after Phase 2 ships)
//   • both have configs                 → server wins (cross-device edits)
//
// Returns whatever the page should consider authoritative.
export async function reconcileConnection(): Promise<Connection | null> {
  let serverConfig: StorageConfig | null = null;
  try {
    serverConfig = await api.getStorageConfig();
  } catch (err) {
    console.warn("[roomflix] storage config fetch failed; using cached", err);
    return loadConnection();
  }

  const local = loadConnection();

  if (serverConfig) {
    const adopted = fromServerShape(serverConfig);
    localStorage.setItem(KEY, JSON.stringify(adopted));
    return adopted;
  }

  if (local) {
    try {
      const saved = await api.putStorageConfig(toServerShape(local));
      const reflected = fromServerShape(saved);
      localStorage.setItem(KEY, JSON.stringify(reflected));
      return reflected;
    } catch (err) {
      console.warn("[roomflix] storage config migrate: server write failed", err);
      return local;
    }
  }

  return null;
}

function toServerShape(c: Connection): Omit<StorageConfig, "updatedAt"> {
  return {
    provider: c.provider,
    accountId: c.accountId,
    accessKeyId: c.accessKeyId,
    secretAccessKey: c.secretAccessKey,
    bucket: c.bucket,
    publicBaseUrl: c.publicBaseUrl,
    maxBytes: c.maxBytes,
    label: c.label,
  };
}

function fromServerShape(s: StorageConfig): Connection {
  return {
    provider: s.provider,
    accountId: s.accountId,
    accessKeyId: s.accessKeyId,
    secretAccessKey: s.secretAccessKey,
    bucket: s.bucket,
    publicBaseUrl: s.publicBaseUrl,
    maxBytes: s.maxBytes,
    label: s.label,
  };
}

function isValidConnection(c: unknown): c is Connection {
  if (!c || typeof c !== "object") return false;
  const r = c as Record<string, unknown>;
  return (
    r.provider === "r2" &&
    typeof r.accountId === "string" &&
    typeof r.accessKeyId === "string" &&
    typeof r.secretAccessKey === "string" &&
    typeof r.bucket === "string" &&
    typeof r.maxBytes === "number"
  );
}
