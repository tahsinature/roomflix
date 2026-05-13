// Persistence for the active storage connection. localStorage so the
// connection survives across tabs + browser restarts — "connect once, use
// everywhere". Anything stored here must be treated as sensitive: the
// secret access key sits on disk in cleartext in the browser profile, so
// shared machines should hit Disconnect when done.
import type { Connection } from "@/lib/buckets/types";

const KEY = "roomflix.bucket.connection.v1";
// One previous version used sessionStorage. Clear it on read so a stale
// per-tab entry doesn't shadow the (now persistent) localStorage one.
const LEGACY_SESSION_KEY = KEY;

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

export function saveConnection(conn: Connection): void {
  localStorage.setItem(KEY, JSON.stringify(conn));
}

export function clearConnection(): void {
  localStorage.removeItem(KEY);
  // Belt-and-suspenders — also clear sessionStorage in case anything in the
  // wild still has the old per-tab entry.
  sessionStorage.removeItem(LEGACY_SESSION_KEY);
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
