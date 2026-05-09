import { Hono } from "hono";

const FETCH_TIMEOUT_MS = 10_000;
const MAX_BYTES = 2_000_000; // 2 MB; typical subtitle files are 10–100 KB.

// GET /api/library/subtitle?url=<encoded subtitle URL>
//
// Browsers refuse to read cross-origin <track> bodies unless the source
// host returns CORS headers, which most static hosts (R2 included by
// default) don't. We fetch server-side and re-serve same-origin so the
// browser stops caring about CORS. Side benefit: we normalize SRT to VTT
// here so the client always sees one canonical format.
export function buildSubtitleProxyRouter() {
  const app = new Hono();

  app.get("/", async (c) => {
    const target = c.req.query("url");
    if (!target || !/^https?:\/\//i.test(target)) {
      return c.json({ error: "missing or invalid url" }, 400);
    }

    let upstream: Response;
    try {
      upstream = await fetch(target, { redirect: "follow", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    } catch (err) {
      return c.json({ error: `fetch failed: ${(err as Error).message}` }, 502);
    }

    if (!upstream.ok) return c.json({ error: `upstream ${upstream.status}` }, 502);

    const text = await upstream.text();
    if (text.length > MAX_BYTES) return c.json({ error: "subtitle too large (max 2 MB)" }, 413);

    const isVtt = /^﻿?WEBVTT/.test(text);
    const body = isVtt ? text : srtToVtt(text);

    return new Response(body, {
      headers: {
        "content-type": "text/vtt; charset=utf-8",
        // Subtitle files don't change often. Let the browser cache them
        // per-URL so a re-watch or page reload doesn't re-fetch upstream.
        "cache-control": "public, max-age=3600",
      },
    });
  });

  return app;
}

// SRT → VTT differs only by a missing `WEBVTT` header and using commas
// instead of periods for milliseconds in timestamps.
function srtToVtt(srt: string): string {
  const normalized = srt.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const fixed = normalized.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2");
  return `WEBVTT\n\n${fixed.trim()}\n`;
}
