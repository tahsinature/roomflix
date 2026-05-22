import { Hono } from "hono";
import type { Context } from "hono";

import type { PublicShare, PublicShareGate } from "@/protocol.ts";
import type { Storage } from "@/storage/index.ts";
import type { StoredShareLink } from "@/storage/types.ts";
import { rateLimit } from "@/middleware/rate-limit.ts";

// PUBLIC, unauthenticated share redemption — the /share/:code surface.
// Deliberately NOT behind requireSpaceMember: the high-entropy code (and
// optional passcode) is the only credential. Rate-limited to blunt
// code-guessing.
//   GET  /api/share/:code           resolve (records the access if open)
//   POST /api/share/:code/unlock    verify passcode, then resolve
export function buildPublicShareRouter(storage: Storage) {
  const app = new Hono();
  app.use("*", rateLimit({ bucket: "share", max: 60 }));

  app.get("/:code", async (c) => {
    const link = await storage.shareLinks.getByCode(c.req.param("code"));
    if (!link) return c.json({ error: "not found" }, 404);

    const blocked = gateState(link);
    if (blocked) return c.json(blocked);
    if (link.passcodeHash) {
      return c.json({ state: "passcode", label: link.label } satisfies PublicShareGate);
    }

    const share = await resolveShare(storage, link);
    if (!share) return c.json({ error: "not found" }, 404);
    await recordAccess(storage, link.id, c);
    return c.json({ state: "ready", share } satisfies PublicShareGate);
  });

  app.post("/:code/unlock", async (c) => {
    const link = await storage.shareLinks.getByCode(c.req.param("code"));
    if (!link) return c.json({ error: "not found" }, 404);

    const blocked = gateState(link);
    if (blocked) return c.json(blocked);

    if (link.passcodeHash) {
      const body = (await c.req.json().catch(() => null)) as { passcode?: unknown } | null;
      const passcode = typeof body?.passcode === "string" ? body.passcode : "";
      const ok = passcode.length > 0 && (await Bun.password.verify(passcode, link.passcodeHash));
      // 403 (not 401) so the client's auth layer doesn't treat a wrong
      // passcode as an expired session.
      if (!ok) return c.json({ error: "Incorrect passcode." }, 403);
    }

    const share = await resolveShare(storage, link);
    if (!share) return c.json({ error: "not found" }, 404);
    await recordAccess(storage, link.id, c);
    return c.json({ state: "ready", share } satisfies PublicShareGate);
  });

  return app;
}

// Non-servable gate reason, or null when the link may be resolved.
function gateState(link: StoredShareLink): PublicShareGate | null {
  if (link.disabled) return { state: "unavailable", reason: "disabled" };
  if (link.expiresAt !== null && link.expiresAt < Date.now()) return { state: "unavailable", reason: "expired" };
  if (link.maxAccesses !== null && link.accessCount >= link.maxAccesses) return { state: "unavailable", reason: "limit" };
  return null;
}

// Resolves a link to its public payload. Returns null when a collection
// target has since been deleted.
async function resolveShare(storage: Storage, link: StoredShareLink): Promise<PublicShare | null> {
  if (link.targetKind === "collection") {
    if (!link.targetCollectionId) return null;
    const collection = await storage.collections.getById(link.targetCollectionId);
    if (!collection) return null;
    return {
      label: link.label,
      kind: "collection",
      title: collection.title,
      items: collection.items.map((it) => ({ url: it.url, name: it.name })),
    };
  }
  if (!link.targetUrl) return null;
  const title = link.targetTitle || link.label || "Shared media";
  return { label: link.label, kind: "url", title, items: [{ url: link.targetUrl, name: title }] };
}

async function recordAccess(storage: Storage, code: string, c: Context): Promise<void> {
  await storage.shareLinks.recordAccess(code);
  await storage.shareAccesses.add({
    shareId: code,
    ip: ipFrom(c),
    userAgent: (c.req.header("user-agent") ?? "").slice(0, 400),
  });
}

// Best-effort client IP. Behind a proxy (k8s ingress / nginx) the real
// address is in x-forwarded-for; falls back to "unknown" in local dev.
function ipFrom(c: Context): string {
  const xff = c.req.header("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return c.req.header("x-real-ip")?.trim() || "unknown";
}
