import type { LibraryImportResult } from "../protocol.ts";
import type { Storage } from "../storage/index.ts";
import { invalidateHealthCache } from "./health.ts";

// POST /api/library/import { videos: [{ url, title?, subtitles?: [...] }] }
//
// Merge semantics: URLs already present are kept as-is and counted as
// "skipped". New URLs are created (with their subtitles, if any).
// Idempotent — running an import twice yields the same final state.
export async function handleLibraryImportRest(
  req: Request,
  storage: Storage,
): Promise<Response> {
  if (req.method !== "POST") {
    return json({ error: "method not allowed" }, 405);
  }

  const body = (await req.json().catch(() => null)) as
    | { videos?: unknown }
    | null;
  if (!body || !Array.isArray(body.videos)) {
    return json({ error: "expected { videos: [...] }" }, 400);
  }

  const result: LibraryImportResult = {
    imported: 0,
    skipped: 0,
    errors: [],
  };

  for (const raw of body.videos) {
    if (!raw || typeof raw !== "object") {
      result.errors.push({
        url: "",
        reason: "entry is not an object",
      });
      continue;
    }
    const r = raw as Record<string, unknown>;
    if (typeof r.url !== "string" || !r.url.trim()) {
      result.errors.push({
        url: typeof r.url === "string" ? r.url : "",
        reason: "missing url",
      });
      continue;
    }
    const url = r.url.trim();

    try {
      const existing = await storage.videos.findByUrl(url);
      if (existing) {
        result.skipped++;
        continue;
      }
      await storage.videos.create({
        url,
        title: typeof r.title === "string" ? r.title : undefined,
        subtitles: parseSubtitles(r.subtitles),
      });
      result.imported++;
    } catch (err) {
      result.errors.push({
        url,
        reason: (err as Error).message,
      });
    }
  }

  if (result.imported > 0) invalidateHealthCache();
  return json(result);
}

function parseSubtitles(raw: unknown) {
  if (!Array.isArray(raw)) return undefined;
  const out = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    if (typeof r.url !== "string" || !r.url.trim()) continue;
    out.push({
      id: "",
      url: r.url,
      label: typeof r.label === "string" ? r.label : "",
      lang: typeof r.lang === "string" ? r.lang : "",
    });
  }
  return out.length > 0 ? out : undefined;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
