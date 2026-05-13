import { Hono } from "hono";

import type { Subtitle } from "@/protocol.ts";
import type { Storage } from "@/storage/index.ts";
import { invalidateHealthCache } from "@/api/health.ts";
import { normalizeUrl } from "@/probe.ts";

// REST routes for video library entries.
//   GET    /api/videos              list all
//   POST   /api/videos              { url, title?, subtitles? } → create (idempotent on url)
//   GET    /api/videos/:id          fetch one
//   PATCH  /api/videos/:id          { title?, subtitles? } → patch
//   DELETE /api/videos/:id          remove
export function buildVideosRouter(storage: Storage) {
  const app = new Hono();

  app.get("/", async (c) => c.json(await storage.videos.list()));

  app.post("/", async (c) => {
    const body = (await c.req.json().catch(() => null)) as { url?: unknown; title?: unknown; subtitles?: unknown } | null;
    const rawUrl = typeof body?.url === "string" ? body.url.trim() : "";
    if (!rawUrl) return c.json({ error: "url is required" }, 400);
    // Auto-prepend https:// for bare URLs so a missing protocol can't break
    // every downstream check (probe, health, playback).
    const inputUrl = normalizeUrl(rawUrl);

    const existing = await storage.videos.findByUrl(inputUrl);
    if (existing) return c.json(existing);

    const created = await storage.videos.create({
      url: inputUrl,
      title: typeof body?.title === "string" ? body.title : undefined,
      subtitles: parseSubtitles(body?.subtitles),
    });
    invalidateHealthCache();
    return c.json(created, 201);
  });

  app.get("/:id", async (c) => {
    const video = await storage.videos.get(c.req.param("id"));
    return video ? c.json(video) : c.json({ error: "not found" }, 404);
  });

  app.patch("/:id", async (c) => {
    const body = (await c.req.json().catch(() => null)) as { url?: unknown; title?: unknown; subtitles?: unknown } | null;
    if (!body) return c.json({ error: "invalid body" }, 400);

    const patch: { url?: string; title?: string; subtitles?: Subtitle[] } = {};
    if (typeof body.url === "string" && body.url.trim()) patch.url = normalizeUrl(body.url);
    if (typeof body.title === "string") patch.title = body.title;
    const subs = parseSubtitles(body.subtitles);
    if (subs !== undefined) patch.subtitles = subs;

    const updated = await storage.videos.update(c.req.param("id"), patch);
    if (!updated) return c.json({ error: "not found" }, 404);
    invalidateHealthCache();
    return c.json(updated);
  });

  app.delete("/:id", async (c) => {
    const removed = await storage.videos.remove(c.req.param("id"));
    if (!removed) return c.json({ error: "not found" }, 404);
    invalidateHealthCache();
    return c.body(null, 204);
  });

  return app;
}

// Coerces unknown input to a Subtitle[] when given an array; returns
// undefined otherwise so callers can distinguish "don't touch" from
// "explicitly empty". Subtitle URLs go through the same normalizer as
// video URLs so a missing scheme can't break the subtitle proxy.
function parseSubtitles(raw: unknown): Subtitle[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: Subtitle[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    if (typeof r.url !== "string" || !r.url.trim()) continue;
    out.push({
      id: typeof r.id === "string" ? r.id : "",
      url: normalizeUrl(r.url),
      label: typeof r.label === "string" ? r.label : "",
      lang: typeof r.lang === "string" ? r.lang : "",
    });
  }
  return out;
}
