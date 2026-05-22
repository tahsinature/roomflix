import { Hono } from "hono";

import type { CollectionHealth, CollectionItem, HealthStatus } from "@/protocol.ts";
import { mapWithConcurrency, probeHealth } from "@/probe.ts";
import type { Storage } from "@/storage/index.ts";
import { requireSpaceMember } from "@/auth.ts";

const HEALTH_TTL_MS = 5 * 60 * 1000;
const HEALTH_CONCURRENCY = 10;
// Per-collection HEAD-probe cache. Cleared when a collection's items change
// (PATCH) or the collection is removed.
const healthCache = new Map<string, CollectionHealth>();

// REST routes for collections — ordered mixed-media lists. Edit/delete is
// allowed for the creator and the space owner; any other member is
// read-only. "Add a folder" is just a PATCH with the merged item list, so
// no special endpoint is needed.
//   GET    /api/collections        list (most-recent first)
//   POST   /api/collections        { title, items? } → create
//   GET    /api/collections/:id    fetch one (items inline — no hydration)
//   PATCH  /api/collections/:id    { title?, items? } → patch
//   DELETE /api/collections/:id    remove
export function buildCollectionsRouter(storage: Storage) {
  const app = new Hono();
  app.use("*", requireSpaceMember(storage));

  app.get("/", async (c) => c.json(await storage.collections.list(c.get("space").id)));

  app.post("/", async (c) => {
    const spaceId = c.get("space").id;
    const createdBy = c.get("user").id;
    const body = (await c.req.json().catch(() => null)) as { title?: unknown; items?: unknown } | null;
    const title = typeof body?.title === "string" ? body.title : "";
    if (!title.trim()) return c.json({ error: "title is required" }, 400);

    const created = await storage.collections.create({
      spaceId,
      createdBy,
      title,
      items: parseItems(body?.items) ?? [],
    });
    return c.json(created, 201);
  });

  app.get("/:id", async (c) => {
    const collection = await storage.collections.get(c.get("space").id, c.req.param("id"));
    return collection ? c.json(collection) : c.json({ error: "not found" }, 404);
  });

  // GET /api/collections/:id/health[?refresh=true] — HEAD-probes every
  // item URL and returns a per-URL availability map. Cached 5 min.
  app.get("/:id/health", async (c) => {
    const collection = await storage.collections.get(c.get("space").id, c.req.param("id"));
    if (!collection) return c.json({ error: "not found" }, 404);

    const cached = healthCache.get(collection.id);
    if (c.req.query("refresh") !== "true" && cached && Date.now() - cached.checkedAt < HEALTH_TTL_MS) {
      return c.json(cached);
    }

    const urls = [...new Set(collection.items.map((it) => it.url))];
    const statuses = await mapWithConcurrency(urls, HEALTH_CONCURRENCY, probeHealth);
    const items: Record<string, HealthStatus> = {};
    urls.forEach((url, i) => {
      items[url] = statuses[i]!;
    });
    const out: CollectionHealth = { checkedAt: Date.now(), items };
    healthCache.set(collection.id, out);
    return c.json(out);
  });

  app.patch("/:id", async (c) => {
    const spaceId = c.get("space").id;
    const userId = c.get("user").id;
    const role = c.get("spaceRole");

    const existing = await storage.collections.get(spaceId, c.req.param("id"));
    if (!existing) return c.json({ error: "not found" }, 404);
    if (existing.createdBy !== userId && role !== "owner") {
      return c.json({ error: "only the collection creator or space owner can edit it" }, 403);
    }

    const body = (await c.req.json().catch(() => null)) as { title?: unknown; items?: unknown } | null;
    if (!body) return c.json({ error: "invalid body" }, 400);

    const patch: { title?: string; items?: CollectionItem[] } = {};
    if (typeof body.title === "string") patch.title = body.title;
    const items = parseItems(body.items);
    if (items !== null) patch.items = items;

    const updated = await storage.collections.update(spaceId, c.req.param("id"), patch);
    if (!updated) return c.json({ error: "not found" }, 404);
    // Items may have changed — the cached probe snapshot is now stale.
    healthCache.delete(c.req.param("id"));
    return c.json(updated);
  });

  app.delete("/:id", async (c) => {
    const spaceId = c.get("space").id;
    const userId = c.get("user").id;
    const role = c.get("spaceRole");

    const existing = await storage.collections.get(spaceId, c.req.param("id"));
    if (!existing) return c.json({ error: "not found" }, 404);
    if (existing.createdBy !== userId && role !== "owner") {
      return c.json({ error: "only the collection creator or space owner can delete it" }, 403);
    }

    const removed = await storage.collections.remove(spaceId, c.req.param("id"));
    if (!removed) return c.json({ error: "not found" }, 404);
    healthCache.delete(c.req.param("id"));
    return c.body(null, 204);
  });

  return app;
}

// Coerces unknown input to CollectionItem[]. Returns null when the field
// wasn't provided so PATCH can distinguish "leave alone" from "empty".
function parseItems(raw: unknown): CollectionItem[] | null {
  if (raw === undefined || raw === null) return null;
  if (!Array.isArray(raw)) return null;
  const out: CollectionItem[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    if (typeof r.url !== "string" || !r.url.trim()) continue;
    out.push({ url: r.url.trim(), name: typeof r.name === "string" ? r.name : "" });
  }
  return out;
}
