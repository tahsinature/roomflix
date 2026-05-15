import { Hono } from "hono";

import type { InviteCode, SpaceMember } from "@/protocol.ts";
import type { Storage } from "@/storage/index.ts";
import { getCurrentPrincipal, requireUser, startGuestSession } from "@/auth.ts";
import { deleteSpaceCascade, listSpaceSummaries } from "@/spaces.ts";

// REST routes for spaces, memberships, and invites.
//
//   GET    /api/spaces                       list (mine, with role)
//   POST   /api/spaces                       { name } → create (caller owns it)
//   GET    /api/spaces/:id                   detail with members + invites (member only)
//   PATCH  /api/spaces/:id                   { name? } → rename (owner only)
//   DELETE /api/spaces/:id                   delete + cascade (owner only)
//   POST   /api/spaces/:id/leave             leave (members only; owners must
//                                            transfer or delete instead)
//   DELETE /api/spaces/:id/members/:userId   remove a member (owner only)
//   POST   /api/spaces/:id/invites           mint a new invite code (owner only)
//   DELETE /api/spaces/:id/invites/:code     revoke an invite (owner only)
//   POST   /api/invites/redeem               { code } → join space
//   PUT    /api/session/space                { spaceId } → switch active space
export function buildSpacesRouter(storage: Storage) {
  const app = new Hono();
  app.use("*", requireUser(storage));

  app.get("/", async (c) => {
    const user = c.get("user");
    const spaces = await listSpaceSummaries(storage, user.id);
    return c.json(spaces);
  });

  app.post("/", async (c) => {
    const user = c.get("user");
    const body = (await c.req.json().catch(() => null)) as { name?: unknown } | null;
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (!name) return c.json({ error: "name is required" }, 400);

    const space = await storage.spaces.create({ name, ownerId: user.id });
    await storage.memberships.add({ spaceId: space.id, userId: user.id, username: user.username, displayName: user.displayName, role: "owner" });
    return c.json(space, 201);
  });

  app.get("/:id", async (c) => {
    const user = c.get("user");
    const spaceId = c.req.param("id");
    const membership = await storage.memberships.get(spaceId, user.id);
    if (!membership) return c.json({ error: "not a member" }, 403);
    const space = await storage.spaces.get(spaceId);
    if (!space) return c.json({ error: "not found" }, 404);

    const members = await storage.memberships.listForSpace(spaceId);
    // Invites are owner-only — hide the list from non-owners so member
    // accounts can't fish out codes they shouldn't see.
    const invites: InviteCode[] = membership.role === "owner" ? await storage.invites.listForSpace(spaceId) : [];

    return c.json({ space, members, invites, role: membership.role });
  });

  app.patch("/:id", async (c) => {
    const user = c.get("user");
    const spaceId = c.req.param("id");
    const m = await storage.memberships.get(spaceId, user.id);
    if (!m || m.role !== "owner") return c.json({ error: "only the owner can rename a space" }, 403);

    const body = (await c.req.json().catch(() => null)) as { name?: unknown } | null;
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (!name) return c.json({ error: "name is required" }, 400);
    const updated = await storage.spaces.update(spaceId, { name });
    return updated ? c.json(updated) : c.json({ error: "not found" }, 404);
  });

  app.delete("/:id", async (c) => {
    const user = c.get("user");
    const spaceId = c.req.param("id");
    const m = await storage.memberships.get(spaceId, user.id);
    if (!m || m.role !== "owner") return c.json({ error: "only the owner can delete a space" }, 403);

    await deleteSpaceCascade(storage, spaceId);
    // If the user's currently-active session points at the deleted space,
    // null it out so the next request lands the client on /spaces instead
    // of looping on 404.
    await maybeClearCurrentSpace(storage, c, spaceId);
    return c.body(null, 204);
  });

  app.post("/:id/leave", async (c) => {
    const user = c.get("user");
    const spaceId = c.req.param("id");
    const m = await storage.memberships.get(spaceId, user.id);
    if (!m) return c.json({ error: "not a member" }, 403);
    if (m.role === "owner") {
      return c.json({ error: "owners can't leave — transfer ownership or delete the space" }, 400);
    }
    await storage.memberships.remove(spaceId, user.id);
    await maybeClearCurrentSpace(storage, c, spaceId);
    return c.body(null, 204);
  });

  app.delete("/:id/members/:userId", async (c) => {
    const user = c.get("user");
    const spaceId = c.req.param("id");
    const target = c.req.param("userId");
    const m = await storage.memberships.get(spaceId, user.id);
    if (!m || m.role !== "owner") return c.json({ error: "only the owner can remove members" }, 403);
    if (target === user.id) return c.json({ error: "owners can't kick themselves — delete the space instead" }, 400);

    const removed = await storage.memberships.remove(spaceId, target);
    return removed ? c.body(null, 204) : c.json({ error: "not a member" }, 404);
  });

  app.post("/:id/invites", async (c) => {
    const user = c.get("user");
    const spaceId = c.req.param("id");
    const m = await storage.memberships.get(spaceId, user.id);
    if (!m || m.role !== "owner") return c.json({ error: "only the owner can mint invites" }, 403);

    const body = (await c.req.json().catch(() => null)) as { kind?: unknown; usesRemaining?: unknown; expiresInHours?: unknown } | null;

    // kind: "member" by default; "guest" enables passwordless join.
    const kind: import("@/protocol.ts").InviteKind = body?.kind === "guest" ? "guest" : "member";

    // usesRemaining: positive number = capped; null/missing = unlimited.
    const usesRemaining =
      typeof body?.usesRemaining === "number" && body.usesRemaining > 0
        ? Math.floor(body.usesRemaining)
        : null;

    // expiresInHours: positive number = TTL; null/missing = never expires.
    // We always set an expiry on guest invites by default to limit blast
    // radius if a code ends up somewhere it shouldn't.
    const expiresAt =
      typeof body?.expiresInHours === "number" && body.expiresInHours > 0
        ? Date.now() + Math.floor(body.expiresInHours) * 60 * 60 * 1000
        : kind === "guest"
          ? Date.now() + 7 * 24 * 60 * 60 * 1000 // 7-day default for guest invites
          : null;

    const invite = await storage.invites.create({ spaceId, createdBy: user.id, kind, usesRemaining, expiresAt });
    return c.json(invite, 201);
  });

  app.delete("/:id/invites/:code", async (c) => {
    const user = c.get("user");
    const spaceId = c.req.param("id");
    const code = c.req.param("code");
    const m = await storage.memberships.get(spaceId, user.id);
    if (!m || m.role !== "owner") return c.json({ error: "only the owner can revoke invites" }, 403);

    const invite = await storage.invites.get(code);
    if (!invite || invite.spaceId !== spaceId) return c.json({ error: "not found" }, 404);
    await storage.invites.remove(code);
    return c.body(null, 204);
  });

  return app;
}

// Companion routes that don't fit cleanly under /api/spaces.
//   POST /api/invites/redeem        — logged-in user joins a space as member
//   POST /api/invites/redeem-guest  — anonymous visitor joins as a guest
//   POST /api/invites/lookup        — peek at code info before committing
export function buildInvitesRouter(storage: Storage) {
  const app = new Hono();

  // Lookup is public (no auth required) — the join page calls it to
  // distinguish "code valid, guest type" from "code valid, member type"
  // and adapt its UI. We return minimal info — just kind + space name —
  // to avoid leaking invite usage counts to unauth'd callers.
  app.post("/lookup", async (c) => {
    const body = (await c.req.json().catch(() => null)) as { code?: unknown } | null;
    const code = typeof body?.code === "string" ? body.code.trim().toLowerCase() : "";
    if (!code) return c.json({ error: "code is required" }, 400);
    const invite = await storage.invites.get(code);
    if (!invite) return c.json({ error: "invite code not found" }, 404);
    if (invite.expiresAt !== null && invite.expiresAt < Date.now()) {
      return c.json({ error: "invite has expired" }, 410);
    }
    if (invite.usesRemaining !== null && invite.usesRemaining <= 0) {
      return c.json({ error: "invite has no uses remaining" }, 410);
    }
    const space = await storage.spaces.get(invite.spaceId);
    if (!space) return c.json({ error: "space not found" }, 404);
    return c.json({ kind: invite.kind, spaceName: space.name });
  });

  // Member redeem — requires an authenticated user account. Refuses guest
  // codes (those have their own endpoint that needs no account).
  app.post("/redeem", requireUser(storage), async (c) => {
    const user = c.get("user");
    const body = (await c.req.json().catch(() => null)) as { code?: unknown } | null;
    const code = typeof body?.code === "string" ? body.code.trim().toLowerCase() : "";
    if (!code) return c.json({ error: "code is required" }, 400);

    const invite = await storage.invites.get(code);
    if (!invite) return c.json({ error: "invite code not found" }, 404);
    if (invite.kind === "guest") {
      return c.json({ error: "this is a guest code — sign out first to redeem it" }, 400);
    }

    const existing = await storage.memberships.get(invite.spaceId, user.id);
    if (existing) {
      const space = await storage.spaces.get(invite.spaceId);
      return c.json({ space, alreadyMember: true });
    }

    const consumed = await storage.invites.consume(code);
    if (!consumed) return c.json({ error: "invite is no longer valid" }, 410);

    await storage.memberships.add({
      spaceId: invite.spaceId,
      userId: user.id,
      username: user.username,
      displayName: user.displayName,
      role: "member",
    });
    const space = await storage.spaces.get(invite.spaceId);
    return c.json({ space, alreadyMember: false });
  });

  // Guest redeem — public. Creates a guest session and sets the cookie
  // identical to a user session, just with userId=null and a chosen
  // display name. Refuses if the caller already has any session — they
  // need to /logout first so we don't accidentally clobber a user session.
  app.post("/redeem-guest", async (c) => {
    const existing = await getCurrentPrincipal(c, storage);
    if (existing) {
      return c.json({ error: "you're already signed in — sign out first to join as guest" }, 409);
    }

    const body = (await c.req.json().catch(() => null)) as { code?: unknown; displayName?: unknown } | null;
    const code = typeof body?.code === "string" ? body.code.trim().toLowerCase() : "";
    const rawName = typeof body?.displayName === "string" ? body.displayName.trim() : "";
    if (!code) return c.json({ error: "code is required" }, 400);
    if (!rawName) return c.json({ error: "display name is required" }, 400);
    if (rawName.length > 50) return c.json({ error: "display name is at most 50 characters" }, 400);

    const invite = await storage.invites.get(code);
    if (!invite) return c.json({ error: "invite code not found" }, 404);
    if (invite.kind !== "guest") {
      return c.json({ error: "this code requires an account — register or sign in instead" }, 400);
    }

    const consumed = await storage.invites.consume(code);
    if (!consumed) return c.json({ error: "invite is no longer valid" }, 410);

    const space = await storage.spaces.get(invite.spaceId);
    if (!space) return c.json({ error: "space not found" }, 404);
    await startGuestSession(c, storage, invite.spaceId, rawName);
    return c.json({ space, displayName: rawName });
  });

  return app;
}

// PUT /api/session/space — switch the caller's currently-active space.
// Lives outside /api/spaces because it operates on the session, not the
// space resource itself.
export function buildSessionSpaceRouter(storage: Storage) {
  const app = new Hono();
  app.use("*", requireUser(storage));

  app.put("/", async (c) => {
    const user = c.get("user");
    const body = (await c.req.json().catch(() => null)) as { spaceId?: unknown } | null;
    const spaceId = typeof body?.spaceId === "string" ? body.spaceId : "";
    if (!spaceId) return c.json({ error: "spaceId is required" }, 400);

    const member = await storage.memberships.get(spaceId, user.id);
    if (!member) return c.json({ error: "not a member of that space" }, 403);

    const { getCookie } = await import("hono/cookie");
    const { SESSION_COOKIE } = await import("@/auth.ts");
    const token = getCookie(c, SESSION_COOKIE);
    if (!token) return c.json({ error: "no session" }, 401);
    await storage.sessions.setCurrentSpace(token, spaceId);
    return c.body(null, 204);
  });

  return app;
}

// Used by space-leave/delete: if the user is currently active in the
// space they just removed, blank their session's currentSpaceId so they
// don't keep hitting 403s on every space-scoped route until they
// manually switch.
async function maybeClearCurrentSpace(storage: Storage, c: import("hono").Context, removedSpaceId: string): Promise<void> {
  const { getCookie } = await import("hono/cookie");
  const { SESSION_COOKIE } = await import("@/auth.ts");
  const cookieValue = getCookie(c, SESSION_COOKIE);
  if (!cookieValue) return;
  const session = await storage.sessions.findByToken(cookieValue);
  if (session?.currentSpaceId === removedSpaceId) {
    // Pick another space the user belongs to, if any — otherwise null.
    const user = c.get("user");
    const memberships = await storage.memberships.listForUser(user.id);
    const next = memberships[0]?.spaceId ?? null;
    await storage.sessions.setCurrentSpace(cookieValue, next);
  }
}

// Suppress unused-import warning when the type-only import below is
// inferred without explicit reference.
export type Hint = SpaceMember;
