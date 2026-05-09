import type { Subtitle } from "../protocol.ts";
import type { Storage } from "../storage/index.ts";
import { invalidateHealthCache } from "./health.ts";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function readJson<T>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}

// Routes:
//   GET    /api/videos
//   POST   /api/videos          { url, title? }
//   GET    /api/videos/:id
//   PATCH  /api/videos/:id      { title? }
//   DELETE /api/videos/:id
export async function handleVideosRest(req: Request, url: URL, storage: Storage): Promise<Response> {
  const segments = url.pathname.split("/").filter(Boolean);
  const id = segments[2];

  if (!id) {
    if (req.method === "GET") {
      return json(await storage.videos.list());
    }
    if (req.method === "POST") {
      const body = await readJson<{
        url?: unknown;
        title?: unknown;
        subtitles?: unknown;
      }>(req);
      const inputUrl = typeof body?.url === "string" ? body.url.trim() : "";
      if (!inputUrl) return json({ error: "url is required" }, 400);
      const inputTitle =
        typeof body?.title === "string" ? body.title : undefined;
      const inputSubtitles = parseSubtitles(body?.subtitles);
      const existing = await storage.videos.findByUrl(inputUrl);
      if (existing) return json(existing);
      const created = await storage.videos.create({
        url: inputUrl,
        title: inputTitle,
        subtitles: inputSubtitles,
      });
      invalidateHealthCache();
      return json(created, 201);
    }
    return json({ error: "method not allowed" }, 405);
  }

  if (req.method === "GET") {
    const video = await storage.videos.get(id);
    if (!video) return json({ error: "not found" }, 404);
    return json(video);
  }
  if (req.method === "PATCH") {
    const body = await readJson<{ title?: unknown; subtitles?: unknown }>(req);
    if (!body) return json({ error: "invalid body" }, 400);
    const patch: { title?: string; subtitles?: Subtitle[] } = {};
    if (typeof body.title === "string") patch.title = body.title;
    const subs = parseSubtitles(body.subtitles);
    if (subs !== undefined) patch.subtitles = subs;
    const updated = await storage.videos.update(id, patch);
    if (!updated) return json({ error: "not found" }, 404);
    invalidateHealthCache();
    return json(updated);
  }
  if (req.method === "DELETE") {
    const removed = await storage.videos.remove(id);
    if (!removed) return json({ error: "not found" }, 404);
    invalidateHealthCache();
    return new Response(null, { status: 204 });
  }
  return json({ error: "method not allowed" }, 405);
}

function parseSubtitles(raw: unknown): Subtitle[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) return undefined;
  const out: Subtitle[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    if (typeof r.url !== "string" || !r.url.trim()) continue;
    out.push({
      id: typeof r.id === "string" ? r.id : "",
      url: r.url,
      label: typeof r.label === "string" ? r.label : "",
      lang: typeof r.lang === "string" ? r.lang : "",
    });
  }
  return out;
}
