import { Hono } from "hono";

import type { ShareTargetKind } from "@/protocol.ts";
import type { Storage } from "@/storage/index.ts";
import { requireSpaceMember } from "@/auth.ts";

// Authenticated management side of public share links. The unauthenticated
// redemption side (the /share/:code surface) lives in api/public_share.ts.
//   GET    /api/shares             list this space's links
//   POST   /api/shares             create a link
//   PATCH  /api/shares/:id         edit label / enable / expiry / cap / passcode
//   DELETE /api/shares/:id         revoke (+ purge its access log)
//   GET    /api/shares/:id/accesses   per-link access log
//
// Edit / delete are allowed for the link's creator and the space owner.
export function buildSharesRouter(storage: Storage) {
  const app = new Hono();
  app.use("*", requireSpaceMember(storage));

  app.get("/", async (c) => c.json(await storage.shareLinks.listForSpace(c.get("space").id)));

  app.post("/", async (c) => {
    const spaceId = c.get("space").id;
    const createdBy = c.get("user").id;
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return c.json({ error: "invalid body" }, 400);

    const targetKind: ShareTargetKind = body.targetKind === "collection" ? "collection" : "url";
    let targetUrl: string | null = null;
    let targetTitle: string | null = null;
    let targetCollectionId: string | null = null;

    if (targetKind === "url") {
      targetUrl = typeof body.targetUrl === "string" ? body.targetUrl.trim() : "";
      if (!targetUrl) return c.json({ error: "targetUrl is required" }, 400);
      targetTitle = typeof body.targetTitle === "string" && body.targetTitle.trim() ? body.targetTitle.trim() : null;
    } else {
      targetCollectionId = typeof body.targetCollectionId === "string" ? body.targetCollectionId : "";
      if (!targetCollectionId) return c.json({ error: "targetCollectionId is required" }, 400);
      // Confirm the collection exists in the caller's space before linking.
      const collection = await storage.collections.get(spaceId, targetCollectionId);
      if (!collection) return c.json({ error: "collection not found" }, 404);
      targetTitle = collection.title;
    }

    const passcode = typeof body.passcode === "string" ? body.passcode.trim() : "";
    const created = await storage.shareLinks.create({
      spaceId,
      createdBy,
      label: typeof body.label === "string" ? body.label : "",
      targetKind,
      targetUrl,
      targetTitle,
      targetCollectionId,
      passcodeHash: passcode ? await Bun.password.hash(passcode) : null,
      expiresAt: parseTimestamp(body.expiresAt),
      maxAccesses: parsePositiveInt(body.maxAccesses),
    });
    return c.json(created, 201);
  });

  app.patch("/:id", async (c) => {
    const spaceId = c.get("space").id;
    const existing = await storage.shareLinks.get(spaceId, c.req.param("id"));
    if (!existing) return c.json({ error: "not found" }, 404);
    if (existing.createdBy !== c.get("user").id && c.get("spaceRole") !== "owner") {
      return c.json({ error: "only the link's creator or the space owner can edit it" }, 403);
    }

    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return c.json({ error: "invalid body" }, 400);

    const patch: { label?: string; disabled?: boolean; expiresAt?: number | null; maxAccesses?: number | null; passcodeHash?: string | null } = {};
    if (typeof body.label === "string") patch.label = body.label;
    if (typeof body.disabled === "boolean") patch.disabled = body.disabled;
    if ("expiresAt" in body) patch.expiresAt = parseTimestamp(body.expiresAt);
    if ("maxAccesses" in body) patch.maxAccesses = parsePositiveInt(body.maxAccesses);
    // passcode: a non-empty string rotates it; "" or null clears it.
    if ("passcode" in body) {
      const pc = typeof body.passcode === "string" ? body.passcode.trim() : "";
      patch.passcodeHash = pc ? await Bun.password.hash(pc) : null;
    }

    const updated = await storage.shareLinks.update(spaceId, c.req.param("id"), patch);
    return updated ? c.json(updated) : c.json({ error: "not found" }, 404);
  });

  app.delete("/:id", async (c) => {
    const spaceId = c.get("space").id;
    const existing = await storage.shareLinks.get(spaceId, c.req.param("id"));
    if (!existing) return c.json({ error: "not found" }, 404);
    if (existing.createdBy !== c.get("user").id && c.get("spaceRole") !== "owner") {
      return c.json({ error: "only the link's creator or the space owner can revoke it" }, 403);
    }
    await storage.shareLinks.remove(spaceId, c.req.param("id"));
    await storage.shareAccesses.removeAllForShare(c.req.param("id"));
    return c.body(null, 204);
  });

  app.get("/:id/accesses", async (c) => {
    const link = await storage.shareLinks.get(c.get("space").id, c.req.param("id"));
    if (!link) return c.json({ error: "not found" }, 404);
    return c.json(await storage.shareAccesses.listForShare(link.id));
  });

  return app;
}

// epoch-ms timestamp, or null for "no expiry" / malformed input.
function parseTimestamp(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) return null;
  return Math.floor(v);
}

// Positive integer cap, or null for "unlimited" / malformed input.
function parsePositiveInt(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 1) return null;
  return Math.floor(v);
}
