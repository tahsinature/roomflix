import { Hono } from "hono";

import type { Subtitle } from "@/protocol.ts";
import type { Storage } from "@/storage/index.ts";
import { invalidateHealthCache } from "@/api/health.ts";
import { normalizeUrl } from "@/probe.ts";
import { requireSpaceMember } from "@/auth.ts";

// REST routes for video library entries. All routes require a current
// space; entries belong to the space — any member sees the list. Edit
// and delete are restricted to the space owner.
//   GET    /api/videos              list all (in current space)
//   POST   /api/videos              { url, title?, subtitles? } → create (idempotent on url)
//   GET    /api/videos/:id          fetch one
//   PATCH  /api/videos/:id          { title?, subtitles? } → patch (owner only)
//   DELETE /api/videos/:id          remove (owner only)
export function buildVideosRouter(storage: Storage) {
  const app = new Hono();
  app.use("*", requireSpaceMember(storage));

  app.get("/", async (c) => c.json(await storage.videos.list(c.get("space").id)));

  app.post("/", async (c) => {
    const spaceId = c.get("space").id;
    const addedBy = c.get("user").id;
    const body = (await c.req.json().catch(() => null)) as { url?: unknown; title?: unknown; subtitles?: unknown } | null;
    const rawUrl = typeof body?.url === "string" ? body.url.trim() : "";
    if (!rawUrl) return c.json({ error: "url is required" }, 400);
    const inputUrl = normalizeUrl(rawUrl);

    const existing = await storage.videos.findByUrl(spaceId, inputUrl);
    if (existing) return c.json(existing);

    const created = await storage.videos.create({
      spaceId,
      addedBy,
      url: inputUrl,
      title: typeof body?.title === "string" ? body.title : undefined,
      subtitles: parseSubtitles(body?.subtitles),
    });
    invalidateHealthCache(spaceId);
    return c.json(created, 201);
  });

  app.get("/:id", async (c) => {
    const video = await storage.videos.get(c.get("space").id, c.req.param("id"));
    return video ? c.json(video) : c.json({ error: "not found" }, 404);
  });

  app.patch("/:id", async (c) => {
    const spaceId = c.get("space").id;
    // Editing a library entry is an owner-level action — members can add
    // new entries but not change existing ones to keep the catalog stable.
    if (c.get("spaceRole") !== "owner") return c.json({ error: "only the space owner can edit library entries" }, 403);

    const body = (await c.req.json().catch(() => null)) as { url?: unknown; title?: unknown; subtitles?: unknown } | null;
    if (!body) return c.json({ error: "invalid body" }, 400);

    const patch: { url?: string; title?: string; subtitles?: Subtitle[] } = {};
    if (typeof body.url === "string" && body.url.trim()) patch.url = normalizeUrl(body.url);
    if (typeof body.title === "string") patch.title = body.title;
    const subs = parseSubtitles(body.subtitles);
    if (subs !== undefined) patch.subtitles = subs;

    const updated = await storage.videos.update(spaceId, c.req.param("id"), patch);
    if (!updated) return c.json({ error: "not found" }, 404);
    invalidateHealthCache(spaceId);
    return c.json(updated);
  });

  app.delete("/:id", async (c) => {
    const spaceId = c.get("space").id;
    if (c.get("spaceRole") !== "owner") return c.json({ error: "only the space owner can remove library entries" }, 403);

    const removed = await storage.videos.remove(spaceId, c.req.param("id"));
    if (!removed) return c.json({ error: "not found" }, 404);
    invalidateHealthCache(spaceId);
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
