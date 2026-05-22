// Shared HEAD-probe helper used by /api/library/health, /api/library/probe
// and /api/collections/:id/health. Different consumers care about different
// aspects of the result (reachability vs content-type), so this returns a
// structured outcome and the consumers map it to their own verdict types.

import type { HealthStatus } from "@/protocol.ts";

const PROBE_TIMEOUT_MS = 5_000;

// Adds `https://` to URLs that look like a hostname-prefixed path but were
// pasted without a scheme (a very common copy-paste shape). Already-schemed
// URLs pass through untouched. Used at every entry point that accepts a URL
// from the user so storage stays consistent.
export function normalizeUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  if (/^[a-z][a-z0-9+\-.]*:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export type FetchProbe =
  | { kind: "ok"; status: number; contentType?: string; contentLength?: number }
  // Reachable, but the host disallows HEAD (e.g. 405, 501). Status returned.
  | { kind: "head-disallowed"; status: number }
  // 4xx / 5xx other than head-disallowed.
  | { kind: "http-error"; status: number }
  // Timeout, DNS failure, TLS failure, connection refused, etc.
  | { kind: "network-error"; reason: string };

export async function fetchProbe(url: string): Promise<FetchProbe> {
  const normalized = normalizeUrl(url);
  if (!/^https?:\/\//i.test(normalized)) {
    return { kind: "network-error", reason: "Not an http(s) URL" };
  }
  // Normalize so URLs with literal spaces or other unencoded characters in
  // the path (common when pasting from a file listing) still resolve.
  // `new URL()` percent-encodes the path during construction; if it throws,
  // we hand the raw string to fetch and let it surface the failure.
  const safeUrl = (() => {
    try {
      return new URL(normalized).toString();
    } catch {
      return normalized;
    }
  })();
  try {
    const res = await fetch(safeUrl, {
      method: "HEAD",
      redirect: "follow",
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    const contentType = res.headers.get("content-type") ?? undefined;
    const lenHdr = res.headers.get("content-length");
    const contentLength = lenHdr ? Number(lenHdr) : undefined;

    if (res.status === 405 || res.status === 501) {
      return { kind: "head-disallowed", status: res.status };
    }
    if (res.status >= 200 && res.status < 400) {
      return { kind: "ok", status: res.status, contentType, contentLength };
    }
    return { kind: "http-error", status: res.status };
  } catch (err) {
    return { kind: "network-error", reason: errMessage(err) };
  }
}

// Strip the constructor name prefix that `String(err)` adds (e.g. "TypeError: …").
// The bare message is more useful in user-facing UI; the kind field already
// disambiguates the category.
function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message || err.name;
  return String(err);
}

const MEDIA_EXTENSIONS = /\.(mp4|webm|ogv|ogg|mkv|mov|m4v|avi|mpeg|mpg|3gp|mp3|m4a|aac|flac|wav|opus|oga|weba)(\?|$)/i;

// True when the URL pathname ends in a known video OR audio container
// extension. Used as a heuristic for "the content type was uncertain, but
// the URL itself strongly suggests a media file".
export function urlLooksLikeMedia(url: string): boolean {
  try {
    const u = new URL(url);
    return MEDIA_EXTENSIONS.test(u.pathname);
  } catch {
    return false;
  }
}

// Maps a FetchProbe to the coarse HealthStatus the UI surfaces — used by
// both the library- and collection-health checks.
export async function probeHealth(url: string): Promise<HealthStatus> {
  const probe = await fetchProbe(url);
  switch (probe.kind) {
    case "ok":
      return "ok";
    case "head-disallowed":
      return "unverified";
    case "http-error":
    case "network-error":
      return "gone";
  }
}

// Runs `fn` over `items` with at most `limit` promises in flight.
export async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
