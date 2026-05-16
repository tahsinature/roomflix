import type { Context, MiddlewareHandler } from "hono";

// Lightweight in-memory per-IP rate limiter. Fixed 1-minute windows;
// when a key exceeds its quota in the current window the middleware
// short-circuits with 429.
//
// Scope: stops brute-force code-guessing on /api/invites/*. Single-
// process; if we ever scale horizontally this needs to move to Redis
// (the keys/windows live in this process's memory only).

const WINDOW_MS = 60_000;

type Bucket = { count: number; windowStart: number };
// Module-scoped so every middleware instance shares state across
// route handlers — necessary for sane global rate limiting on the
// same IP across multiple endpoints.
const buckets = new Map<string, Bucket>();

// Periodically drop stale buckets so the map doesn't grow forever on
// long-lived processes. Two-window grace lets a bucket coast through
// the boundary without being repeatedly evicted+recreated.
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of buckets) {
    if (now - v.windowStart > WINDOW_MS * 2) buckets.delete(k);
  }
}, 5 * 60_000);

export type RateLimitOptions = {
  // Bucket label baked into the key so two different routes don't
  // share quotas on the same IP. e.g. "redeem" vs "lookup".
  bucket: string;
  // Allowed requests per WINDOW_MS.
  max: number;
  // Optional custom key (defaults to ipFrom). Useful if you want to
  // key by something other than IP (e.g. session token).
  keyFn?: (c: Context) => string;
};

export function rateLimit(opts: RateLimitOptions): MiddlewareHandler {
  return async (c, next) => {
    const ident = opts.keyFn ? opts.keyFn(c) : ipFrom(c);
    const key = `${opts.bucket}:${ident}`;
    const now = Date.now();
    const entry = buckets.get(key);
    if (!entry || now - entry.windowStart > WINDOW_MS) {
      buckets.set(key, { count: 1, windowStart: now });
      return next();
    }
    entry.count++;
    if (entry.count > opts.max) {
      // Surface a tail of the bucket label so production logs are
      // diagnosable without exposing implementation details to the
      // client. (The 429 body stays generic.)
      console.warn(`[rate-limit] ${opts.bucket} exceeded by ${ident} (${entry.count}/${opts.max} in window)`);
      const retryAfterSec = Math.ceil((WINDOW_MS - (now - entry.windowStart)) / 1000);
      c.header("Retry-After", String(retryAfterSec));
      return c.json({ error: "Too many requests. Slow down and try again in a moment." }, 429);
    }
    return next();
  };
}

// Best-effort IP extraction. Honors a small set of proxy headers
// because the server typically sits behind one (nginx, fly proxy, k8s
// ingress). Trusts whatever's set — fine for rate-limiting (worst
// case an attacker spoofs and we under-count) but DO NOT use this
// helper for auth decisions.
function ipFrom(c: Context): string {
  const xff = c.req.header("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = c.req.header("x-real-ip");
  if (real) return real.trim();
  // Bun's Hono adapter doesn't expose remote IP without a custom
  // adapter; fall back to a stable "anon" so requests with no proxy
  // headers still share a quota rather than running unbounded.
  return "anon";
}
