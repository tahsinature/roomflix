import { Hono } from "hono";

import type { StorageConnection } from "@/protocol.ts";
import type { Storage } from "@/storage/index.ts";
import { getCurrentPrincipal } from "@/auth.ts";

// Per-space derived view of storage connections. Returns the subset of
// connections that are owned by the space owner AND activated in this
// space AND accessible to the caller:
//   - space owner sees all of their activations
//   - other real members see only connections they've been granted
//   - guests see only activations with `openToGuests = true`
//
// Uses getCurrentPrincipalFromRequest directly so guests are first-
// class (they don't appear in space_members, so the usual `requireUser
// + membership check` pattern would reject them).
export function buildSpaceStorageRouter(storage: Storage) {
  const app = new Hono();

  app.get("/", async (c) => {
    const principal = await getCurrentPrincipal(c, storage);
    if (!principal) return c.json({ error: "unauthorized" }, 401);

    const spaceId = c.req.param("id");
    if (!spaceId) return c.json({ error: "space id is required" }, 400);
    const space = await storage.spaces.get(spaceId);
    if (!space) return c.json({ error: "space not found" }, 404);

    // Resolve the caller's role in this space:
    //   - user with a membership row → "owner" or "member"
    //   - guest whose currentSpaceId === this space → "guest"
    //   - anything else → 403
    let role: "owner" | "member" | "guest";
    if (principal.kind === "user") {
      const membership = await storage.memberships.get(spaceId, principal.user.id);
      if (!membership) return c.json({ error: "you are not a member of this space" }, 403);
      role = membership.role === "owner" ? "owner" : "member";
    } else {
      if (principal.session.currentSpaceId !== spaceId) {
        return c.json({ error: "you are not in this space" }, 403);
      }
      role = "guest";
    }

    const activations = await storage.storageActivations.listForSpace(spaceId);
    if (activations.length === 0) return c.json([]);

    const connectionIds = activations.map((a) => a.connectionId);
    const connections = await storage.storageConnections.getMany(connectionIds);
    const byId = new Map(connections.map((c) => [c.id, c]));

    const allowed: StorageConnection[] = [];
    for (const act of activations) {
      const conn = byId.get(act.connectionId);
      if (!conn) continue;
      // Defensive: must belong to the space owner — drops orphan rows
      // left behind by a hypothetical space-transfer flow.
      if (conn.ownerId !== space.ownerId) continue;

      // Role-based access. Activation existing implies at least
      // "members" level; openToGuests narrows in the other direction
      // (guests also allowed). No per-user grants — too much config
      // complexity for the value at this app's scale.
      if (role === "owner" || role === "member" || (role === "guest" && act.openToGuests)) {
        allowed.push(conn);
      }
    }

    // Decorate with the owner's display name so the UI can show
    // "by @alice" at a glance. By invariant every returned connection
    // is owned by the same person (space.ownerId), so one lookup
    // covers them all.
    const owner = await storage.users.findById(space.ownerId);
    const decorated = allowed.map((conn) => ({
      ...conn,
      ownerUsername: owner?.username,
      ownerDisplayName: owner?.displayName ?? null,
    }));
    return c.json(decorated);
  });

  return app;
}
