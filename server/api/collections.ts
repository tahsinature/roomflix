import { Hono } from "hono";

import type { Collection, CollectionHealth, CollectionItem, HealthStatus } from "@/protocol.ts";
import { mapWithConcurrency, probeHealth } from "@/probe.ts";
import type { Storage } from "@/storage/index.ts";
import { invalidateCollectionItems, resolveCollection } from "@/storage/collection-resolver.ts";
import { requireSpaceMember } from "@/auth.ts";

const HEALTH_TTL_MS = 5 * 60 * 1000;
const HEALTH_CONCURRENCY = 10;
// Per-collection HEAD-probe cache. Cleared when a collection's items change
// (PATCH) or the collection is removed.
const healthCache = new Map<string, CollectionHealth>();

// REST routes for collections — ordered mixed-media lists. A collection is
// either MANUAL (items stored inline, editable) or SYNCED to a storage
// folder (items computed live on read, read-only). Edit/delete on manual
// collections is allowed for the creator and the space owner.
//   GET    /api/collections             list (most-recent first)
//   POST   /api/collections             { title, items?, source? } → create
//   GET    /api/collections/:id         fetch one
//   PATCH  /api/collections/:id         { title?, items? } → patch (manual only)
//   DELETE /api/collections/:id         remove
//   GET    /api/collections/:id/health  per-item availability
export function buildCollectionsRouter(storage: Storage) {
  const app = new Hono();
  app.use("*", requireSpaceMember(storage));

  app.get("/", async (c) => {
    const spaceId = c.get("space").id;
    const raw = await storage.collections.list(spaceId);
    // Fan out the live resolves for synced collections in parallel.
    const resolved = await Promise.all(raw.map((coll) => resolveCollection(coll, storage)));
    return c.json(resolved);
  });

  app.post("/", async (c) => {
    const spaceId = c.get("space").id;
    const createdBy = c.get("user").id;
    const body = (await c.req.json().catch(() => null)) as { title?: unknown; items?: unknown; source?: unknown; coverUrl?: unknown } | null;
    const title = typeof body?.title === "string" ? body.title : "";
    if (!title.trim()) return c.json({ error: "title is required" }, 400);

    // Validate the optional source. The folder prefix must belong to a
    // connection the caller's space has activated; otherwise other
    // members couldn't read it anyway. We don't enforce ownership here
    // because the space owner can have shared the connection.
    const source = parseSource(body?.source);
    if (source) {
      const conn = await storage.storageConnections.get(source.connectionId);
      if (!conn) return c.json({ error: "source connection not found" }, 404);
      const activations = await storage.storageActivations.listForSpace(spaceId);
      if (!activations.some((a) => a.connectionId === source.connectionId)) {
        return c.json({ error: "that connection is not activated in this space" }, 403);
      }
    }

    const created = await storage.collections.create({
      spaceId,
      createdBy,
      title,
      items: parseItems(body?.items) ?? [],
      source,
      coverUrl: parseCoverUrl(body?.coverUrl),
    });
    return c.json(await resolveCollection(created, storage), 201);
  });

  app.get("/:id", async (c) => {
    const collection = await storage.collections.get(c.get("space").id, c.req.param("id"));
    if (!collection) return c.json({ error: "not found" }, 404);
    const refresh = c.req.query("refresh") === "true";
    return c.json(await resolveCollection(collection, storage, { refresh }));
  });

  // GET /api/collections/:id/health[?refresh=true] — HEAD-probes every
  // item URL and returns a per-URL availability map. Cached 5 min.
  app.get("/:id/health", async (c) => {
    const collection = await storage.collections.get(c.get("space").id, c.req.param("id"));
    if (!collection) return c.json({ error: "not found" }, 404);
    // Resolve first so synced collections probe their current items.
    const resolved = await resolveCollection(collection, storage);

    const cached = healthCache.get(resolved.id);
    if (c.req.query("refresh") !== "true" && cached && Date.now() - cached.checkedAt < HEALTH_TTL_MS) {
      return c.json(cached);
    }

    const urls = [...new Set(resolved.items.map((it) => it.url))];
    const statuses = await mapWithConcurrency(urls, HEALTH_CONCURRENCY, probeHealth);
    const items: Record<string, HealthStatus> = {};
    urls.forEach((url, i) => {
      items[url] = statuses[i]!;
    });
    const out: CollectionHealth = { checkedAt: Date.now(), items };
    healthCache.set(resolved.id, out);
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

    const body = (await c.req.json().catch(() => null)) as { title?: unknown; items?: unknown; coverUrl?: unknown } | null;
    if (!body) return c.json({ error: "invalid body" }, 400);

    // Synced collections track a folder — title and items are derived,
    // so any edit attempt is a conceptual mistake. `coverUrl` is fair
    // game on synced collections though — it's metadata, not content.
    if (existing.source) {
      if (typeof body.title === "string" || body.items !== undefined) {
        return c.json({ error: "this collection is synced to a storage folder; manage it there" }, 409);
      }
    }

    const patch: { title?: string; items?: CollectionItem[]; coverUrl?: string | null } = {};
    if (typeof body.title === "string") patch.title = body.title;
    const items = parseItems(body.items);
    if (items !== null) patch.items = items;
    // Distinguish "omit" (leave alone) from "null" (clear it). The
    // parser returns the sentinel `undefined` when the key is absent.
    if ("coverUrl" in body) patch.coverUrl = parseCoverUrl(body.coverUrl);

    const updated = await storage.collections.update(spaceId, c.req.param("id"), patch);
    if (!updated) return c.json({ error: "not found" }, 404);
    healthCache.delete(c.req.param("id"));
    return c.json(await resolveCollection(updated, storage));
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
    invalidateCollectionItems(c.req.param("id"));
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

// Coerces unknown cover input. `null` and empty/whitespace-only strings
// become `null` (clears the cover); a non-empty string is trimmed and
// kept. We don't validate that it's reachable or actually an image —
// the user said lenient, and `<img>` falls back to the placeholder
// when the URL fails to load.
function parseCoverUrl(raw: unknown): string | null {
  if (raw === null) return null;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed || null;
}

// Coerces unknown input to a CollectionSource. Anything malformed → null.
function parseSource(raw: unknown): Collection["source"] {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { connectionId?: unknown; folderPrefix?: unknown };
  if (typeof r.connectionId !== "string" || !r.connectionId.trim()) return null;
  if (typeof r.folderPrefix !== "string") return null;
  return { connectionId: r.connectionId.trim(), folderPrefix: r.folderPrefix };
}
