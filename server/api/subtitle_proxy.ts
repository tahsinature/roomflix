// GET /api/library/subtitle?url=<encoded subtitle URL>
//
// Browsers refuse to read cross-origin <track> bodies unless the source host
// returns CORS headers, which most static hosts (including R2 with the
// default config) don't. We fetch the file server-side and re-serve it
// same-origin so the browser stops caring about CORS. Side benefit: we can
// convert SRT to VTT here so the client always sees one canonical format.

const FETCH_TIMEOUT_MS = 10_000;
const MAX_BYTES = 2_000_000; // 2 MB; typical subtitle files are 10–100 KB.

export async function handleSubtitleProxyRest(
  req: Request,
  url: URL,
): Promise<Response> {
  if (req.method !== "GET") {
    return json({ error: "method not allowed" }, 405);
  }

  const target = url.searchParams.get("url");
  if (!target || !/^https?:\/\//i.test(target)) {
    return json({ error: "missing or invalid url" }, 400);
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (err) {
    return json(
      { error: `fetch failed: ${(err as Error).message}` },
      502,
    );
  }

  if (!upstream.ok) {
    return json({ error: `upstream ${upstream.status}` }, 502);
  }

  const text = await upstream.text();
  if (text.length > MAX_BYTES) {
    return json({ error: "subtitle too large (max 2 MB)" }, 413);
  }

  const isVtt = /^﻿?WEBVTT/.test(text);
  const body = isVtt ? text : srtToVtt(text);

  return new Response(body, {
    headers: {
      "content-type": "text/vtt; charset=utf-8",
      // Subtitle files don't change often. Let the browser cache them per-URL
      // so a re-watch or page reload doesn't re-fetch the upstream every time.
      "cache-control": "public, max-age=3600",
    },
  });
}

// Lightweight SRT → VTT conversion. SRT differs only by missing the WEBVTT
// header and using `,` instead of `.` for ms in timestamps.
function srtToVtt(srt: string): string {
  const normalized = srt.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const fixed = normalized.replace(
    /(\d{2}:\d{2}:\d{2}),(\d{3})/g,
    "$1.$2",
  );
  return `WEBVTT\n\n${fixed.trim()}\n`;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
