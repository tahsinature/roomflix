import type { LibraryImportResult, Subtitle } from "../protocol.ts";
import type { Storage } from "../storage/index.ts";
import { invalidateHealthCache } from "./health.ts";

// POST /api/library/import { videos: [{ url, title?, subtitles?: [...] }] }
//
// Last-import-wins semantics: existing entries are *patched* with the
// imported title/subtitles when they differ. Only entries already
// identical are skipped. Idempotent — running an import twice yields the
// same final state and counts everything as skipped on the second run.
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
    updated: 0,
    skipped: 0,
    errors: [],
  };

  for (const raw of body.videos) {
    if (!raw || typeof raw !== "object") {
      result.errors.push({ url: "", reason: "entry is not an object" });
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
    // parseSubtitles returns undefined when the field is missing or not an
    // array (so we don't touch existing subtitles); returns an array
    // otherwise (including [] for "explicitly cleared").
    const subsParsed = parseSubtitles(r.subtitles);
    const titleParsed = typeof r.title === "string" ? r.title : undefined;

    try {
      const existing = await storage.videos.findByUrl(url);
      if (!existing) {
        await storage.videos.create({
          url,
          title: titleParsed,
          subtitles: subsParsed,
        });
        result.imported++;
        continue;
      }

      // Detect what actually changed so we don't churn the updatedAt for
      // unchanged entries.
      const titleChanged =
        titleParsed !== undefined &&
        titleParsed.trim() !== "" &&
        titleParsed !== existing.title;
      const subsChanged =
        subsParsed !== undefined &&
        !subtitlesEqual(subsParsed, existing.subtitles);

      if (!titleChanged && !subsChanged) {
        result.skipped++;
        continue;
      }

      await storage.videos.update(existing.id, {
        title: titleChanged ? titleParsed : undefined,
        subtitles: subsChanged ? subsParsed : undefined,
      });
      result.updated++;
    } catch (err) {
      result.errors.push({ url, reason: (err as Error).message });
    }
  }

  if (result.imported > 0 || result.updated > 0) invalidateHealthCache();
  return json(result);
}

function parseSubtitles(raw: unknown): Subtitle[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: Subtitle[] = [];
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
  return out;
}

// Compare ignoring ids — exports strip ids and the server re-mints them
// on import, so id equality would never hold across a round-trip.
function subtitlesEqual(a: Subtitle[], b: Subtitle[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = b[i]!;
    if (x.url !== y.url || x.label !== y.label || x.lang !== y.lang) {
      return false;
    }
  }
  return true;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
