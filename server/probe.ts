// Shared HEAD-probe helper used by both /api/library/health and
// /api/library/probe. Different consumers care about different aspects of
// the result (reachability vs content-type), so this returns a structured
// outcome and the consumers map it to their own verdict types.

const PROBE_TIMEOUT_MS = 5_000;

export type FetchProbe =
  | { kind: "ok"; status: number; contentType?: string; contentLength?: number }
  // Reachable, but the host disallows HEAD (e.g. 405, 501). Status returned.
  | { kind: "head-disallowed"; status: number }
  // 4xx / 5xx other than head-disallowed.
  | { kind: "http-error"; status: number }
  // Timeout, DNS failure, TLS failure, connection refused, etc.
  | { kind: "network-error"; reason: string };

export async function fetchProbe(url: string): Promise<FetchProbe> {
  if (!/^https?:\/\//i.test(url)) {
    return { kind: "network-error", reason: "Not an http(s) URL" };
  }
  try {
    const res = await fetch(url, {
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

const VIDEO_EXTENSIONS = /\.(mp4|webm|ogv|ogg|mkv|mov|m4v|avi|mpeg|mpg|3gp)(\?|$)/i;

// True when the URL pathname ends in a known video container extension.
// Used as a heuristic for "the content type was uncertain, but the URL
// itself strongly suggests a video file".
export function urlLooksLikeVideo(url: string): boolean {
  try {
    const u = new URL(url);
    return VIDEO_EXTENSIONS.test(u.pathname);
  } catch {
    return false;
  }
}
