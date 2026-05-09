import type { ProbeResult } from "../protocol.ts";
import { fetchProbe, urlLooksLikeVideo } from "../probe.ts";

// POST /api/library/probe   { url }  →  ProbeResult
//
// Single-shot URL probe used by the library Add form to gate video creation
// behind a reachability + content-type check. Caller can override on
// "uncertain" verdicts (e.g. CDNs that don't return content-types).
export async function handleProbeRest(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return json({ error: "method not allowed" }, 405);
  }

  const body = (await req.json().catch(() => null)) as
    | { url?: unknown }
    | null;
  const url = typeof body?.url === "string" ? body.url.trim() : "";
  if (!url) return json({ error: "url is required" }, 400);

  const probe = await fetchProbe(url);
  const result = classify(url, probe);
  return json(result);
}

function classify(
  url: string,
  probe: Awaited<ReturnType<typeof fetchProbe>>,
): ProbeResult {
  if (probe.kind === "ok") {
    const looksVideo =
      probe.contentType?.startsWith("video/") || urlLooksLikeVideo(url);
    if (looksVideo) {
      return {
        verdict: "ok",
        contentType: probe.contentType,
        contentLength: probe.contentLength,
      };
    }
    return {
      verdict: "uncertain",
      contentType: probe.contentType,
      contentLength: probe.contentLength,
      message: probe.contentType
        ? `Content type is "${probe.contentType}" — not a video`
        : "Server didn't return a content type",
    };
  }

  if (probe.kind === "head-disallowed") {
    if (urlLooksLikeVideo(url)) {
      return {
        verdict: "ok",
        message: "Inferred from URL extension (host doesn't allow HEAD)",
      };
    }
    return {
      verdict: "uncertain",
      message: "Host doesn't allow HEAD requests, can't verify content type",
    };
  }

  if (probe.kind === "http-error") {
    return {
      verdict: "gone",
      message: `Server returned HTTP ${probe.status}`,
    };
  }

  // network-error covers DNS failure, timeout, TLS, connection refused, etc.
  // Surface the underlying reason so the user can debug CDN / DNS issues.
  return {
    verdict: "gone",
    message: probe.reason || "Network error",
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
