import type { Storage } from "../storage/index.ts";

const MAX_BYTES = 1_000_000; // 1 MB cap; typical subtitle files are 10–50 KB.
const VTT_CONTENT_TYPE = "text/vtt; charset=utf-8";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// Routes:
//   POST   /api/subtitles       { content, filename } → { id, url }
//   GET    /api/subtitles/:id   → text/vtt body
export async function handleSubtitlesRest(
  req: Request,
  url: URL,
  storage: Storage,
): Promise<Response> {
  const segments = url.pathname.split("/").filter(Boolean);
  const id = segments[2];

  if (!id) {
    if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

    const body = await req
      .json()
      .catch(() => null) as { content?: unknown; filename?: unknown } | null;

    if (!body || typeof body.content !== "string" || !body.content.trim()) {
      return json({ error: "content is required" }, 400);
    }
    if (body.content.length > MAX_BYTES) {
      return json({ error: "subtitle too large (max 1 MB)" }, 413);
    }

    const filename = typeof body.filename === "string" ? body.filename : "";
    const isSrt =
      /\.srt$/i.test(filename) ||
      (!/\.vtt$/i.test(filename) && !isVtt(body.content));

    const content = isSrt ? srtToVtt(body.content) : body.content;
    const stored = await storage.subtitleFiles.put({
      content,
      contentType: VTT_CONTENT_TYPE,
    });

    return json(stored, 201);
  }

  if (req.method !== "GET") return json({ error: "method not allowed" }, 405);

  const file = await storage.subtitleFiles.get(id);
  if (!file) return json({ error: "not found" }, 404);
  return new Response(file.content, {
    headers: {
      "content-type": file.contentType,
      // Tracks change rarely; let the browser cache by URL (URL is content-addressed by id).
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}

function isVtt(text: string): boolean {
  return /^﻿?WEBVTT/.test(text);
}

// SRT → VTT differs in two trivial ways: VTT requires a `WEBVTT` header, and
// timestamps use `.` instead of `,` for the millisecond separator.
function srtToVtt(srt: string): string {
  const normalized = srt.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const fixed = normalized.replace(
    /(\d{2}:\d{2}:\d{2}),(\d{3})/g,
    "$1.$2",
  );
  return `WEBVTT\n\n${fixed.trim()}\n`;
}
