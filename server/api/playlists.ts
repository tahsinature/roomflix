import { Hono } from "hono";

import type { PlaylistDetail, Video } from "@/protocol.ts";
import type { Storage } from "@/storage/index.ts";
import { requireSpaceMember } from "@/auth.ts";

// REST routes for playlists. Edit/delete is allowed for the creator and
// for the space owner — any other member is read-only.
//   GET    /api/playlists           list (most-recent first)
//   POST   /api/playlists           { title, videoIds? } → create
//   GET    /api/playlists/:id       PlaylistDetail (with hydrated videos)
//   PATCH  /api/playlists/:id       { title?, videoIds? } → patch
//   DELETE /api/playlists/:id       remove
export function buildPlaylistsRouter(storage: Storage) {
  const app = new Hono();
  app.use("*", requireSpaceMember(storage));

  app.get("/", async (c) => c.json(await storage.playlists.list(c.get("space").id)));

  app.post("/", async (c) => {
    const spaceId = c.get("space").id;
    const createdBy = c.get("user").id;
    const body = (await c.req.json().catch(() => null)) as { title?: unknown; videoIds?: unknown } | null;
    const title = typeof body?.title === "string" ? body.title : "";
    const videoIds = parseVideoIds(body?.videoIds);
    if (!title.trim()) return c.json({ error: "title is required" }, 400);

    const created = await storage.playlists.create({ spaceId, createdBy, title, videoIds: videoIds ?? [] });
    return c.json(created, 201);
  });

  app.get("/:id", async (c) => {
    const spaceId = c.get("space").id;
    const playlist = await storage.playlists.get(spaceId, c.req.param("id"));
    if (!playlist) return c.json({ error: "not found" }, 404);
    const videos: Array<Video | null> = await Promise.all(playlist.videoIds.map((id) => storage.videos.get(spaceId, id)));
    const detail: PlaylistDetail = { ...playlist, videos };
    return c.json(detail);
  });

  app.patch("/:id", async (c) => {
    const spaceId = c.get("space").id;
    const userId = c.get("user").id;
    const role = c.get("spaceRole");

    const existing = await storage.playlists.get(spaceId, c.req.param("id"));
    if (!existing) return c.json({ error: "not found" }, 404);
    if (existing.createdBy !== userId && role !== "owner") {
      return c.json({ error: "only the playlist creator or space owner can edit it" }, 403);
    }

    const body = (await c.req.json().catch(() => null)) as { title?: unknown; videoIds?: unknown } | null;
    if (!body) return c.json({ error: "invalid body" }, 400);

    const patch: { title?: string; videoIds?: string[] } = {};
    if (typeof body.title === "string") patch.title = body.title;
    const videoIds = parseVideoIds(body.videoIds);
    if (videoIds !== null) patch.videoIds = videoIds;

    const updated = await storage.playlists.update(spaceId, c.req.param("id"), patch);
    if (!updated) return c.json({ error: "not found" }, 404);
    return c.json(updated);
  });

  app.delete("/:id", async (c) => {
    const spaceId = c.get("space").id;
    const userId = c.get("user").id;
    const role = c.get("spaceRole");

    const existing = await storage.playlists.get(spaceId, c.req.param("id"));
    if (!existing) return c.json({ error: "not found" }, 404);
    if (existing.createdBy !== userId && role !== "owner") {
      return c.json({ error: "only the playlist creator or space owner can delete it" }, 403);
    }

    const removed = await storage.playlists.remove(spaceId, c.req.param("id"));
    if (!removed) return c.json({ error: "not found" }, 404);
    return c.body(null, 204);
  });

  return app;
}

// Coerces an unknown into a string[]. Returns null when the field wasn't
// provided so the PATCH route can distinguish "leave alone" from
// "explicitly empty".
function parseVideoIds(raw: unknown): string[] | null {
  if (raw === undefined) return null;
  if (!Array.isArray(raw)) return null;
  return raw.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
}
