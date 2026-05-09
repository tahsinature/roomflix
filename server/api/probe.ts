import { Hono } from "hono";

import type { ProbeResult } from "@/protocol.ts";
import { fetchProbe, urlLooksLikeVideo } from "@/probe.ts";

// POST /api/library/probe  { url } → ProbeResult
//
// Single-shot URL probe used by the library Add form to gate creation
// behind a reachability + content-type check. The caller can override on
// "uncertain" verdicts (e.g. CDNs that don't return content-types).
export function buildProbeRouter() {
  const app = new Hono();

  app.post("/", async (c) => {
    const body = (await c.req.json().catch(() => null)) as { url?: unknown } | null;
    const url = typeof body?.url === "string" ? body.url.trim() : "";
    if (!url) return c.json({ error: "url is required" }, 400);

    const probe = await fetchProbe(url);
    return c.json(classify(url, probe));
  });

  return app;
}

function classify(url: string, probe: Awaited<ReturnType<typeof fetchProbe>>): ProbeResult {
  if (probe.kind === "ok") {
    const looksVideo = probe.contentType?.startsWith("video/") || urlLooksLikeVideo(url);
    if (looksVideo) {
      return { verdict: "ok", contentType: probe.contentType, contentLength: probe.contentLength };
    }
    return {
      verdict: "uncertain",
      contentType: probe.contentType,
      contentLength: probe.contentLength,
      message: probe.contentType ? `Content type is "${probe.contentType}" — not a video` : "Server didn't return a content type",
    };
  }

  if (probe.kind === "head-disallowed") {
    if (urlLooksLikeVideo(url)) {
      return { verdict: "ok", message: "Inferred from URL extension (host doesn't allow HEAD)" };
    }
    return { verdict: "uncertain", message: "Host doesn't allow HEAD requests, can't verify content type" };
  }

  if (probe.kind === "http-error") {
    return { verdict: "gone", message: `Server returned HTTP ${probe.status}` };
  }

  // network-error covers DNS, timeout, TLS, connection refused, etc.
  // Surface the underlying reason so the user can debug CDN / DNS issues.
  return { verdict: "gone", message: probe.reason || "Network error" };
}
