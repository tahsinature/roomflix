import { Hono } from "hono";

import type { ProbeResult } from "@/protocol.ts";
import { fetchProbe, urlLooksLikeMedia } from "@/probe.ts";
import { requireSpaceMember } from "@/auth.ts";
import type { Storage } from "@/storage/index.ts";

// POST /api/library/probe  { url } → ProbeResult
//
// Single-shot URL probe used by the library Add form to gate creation
// behind a reachability + content-type check. Space-gated so the endpoint
// can't be used as an open proxy.
export function buildProbeRouter(storage: Storage) {
  const app = new Hono();
  app.use("*", requireSpaceMember(storage));

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
    const ct = probe.contentType;
    const looksMedia = ct?.startsWith("video/") || ct?.startsWith("audio/") || urlLooksLikeMedia(url);
    if (looksMedia) {
      return { verdict: "ok", contentType: ct, contentLength: probe.contentLength };
    }
    return {
      verdict: "uncertain",
      contentType: ct,
      contentLength: probe.contentLength,
      message: ct ? `Content type is "${ct}" — not a video or audio file` : "Server didn't return a content type",
    };
  }

  if (probe.kind === "head-disallowed") {
    if (urlLooksLikeMedia(url)) {
      return { verdict: "ok", message: "Inferred from URL extension (host doesn't allow HEAD)" };
    }
    return { verdict: "uncertain", message: "Host doesn't allow HEAD requests, can't verify content type" };
  }

  if (probe.kind === "http-error") {
    return { verdict: "gone", message: `Server returned HTTP ${probe.status}` };
  }

  return { verdict: "gone", message: probe.reason || "Network error" };
}
