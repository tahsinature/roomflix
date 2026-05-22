import { Hono } from "hono";

import type { InviteCode, JoinRequest, SpaceMember } from "@/protocol.ts";
import type { Storage } from "@/storage/index.ts";
import { generateSessionToken, getCurrentPrincipal, requireUser, startGuestSession } from "@/auth.ts";
import { rateLimit } from "@/middleware/rate-limit.ts";
import { deleteSpaceCascade, listSpaceSummaries } from "@/spaces.ts";

// Optional callback invoked when a JoinRequest is created. Wired up
// from server/index.ts to fan a notification to admins watching the
// space via WebSocket. Kept abstract here so the routes don't need to
// know anything about WS internals.
export type JoinRequestCreatedHook = (request: JoinRequest) => void;

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
    if (!m || m.role !== "owner") return c.json({ error: "only the owner can update a space" }, 403);

    const body = (await c.req.json().catch(() => null)) as { name?: unknown; joinPolicy?: unknown } | null;
    const patch: { name?: string; joinPolicy?: "open" | "approval" } = {};
    if (body?.name !== undefined) {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (!name) return c.json({ error: "name can't be empty" }, 400);
      patch.name = name;
    }
    if (body?.joinPolicy !== undefined) {
      if (body.joinPolicy !== "open" && body.joinPolicy !== "approval") {
        return c.json({ error: "joinPolicy must be 'open' or 'approval'" }, 400);
      }
      patch.joinPolicy = body.joinPolicy;
    }
    if (Object.keys(patch).length === 0) {
      return c.json({ error: "nothing to update" }, 400);
    }
    const updated = await storage.spaces.update(spaceId, patch);
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

    const body = (await c.req.json().catch(() => null)) as { usesRemaining?: unknown; expiresInHours?: unknown } | null;

    // usesRemaining: positive number = capped; null = explicit
    // unlimited; missing = sensible default. We default to a CAP
    // (not unlimited) so a leaked code can't be redeemed forever by
    // strangers — admin can override per-invite when they want.
    const usesRemaining = typeof body?.usesRemaining === "number" && body.usesRemaining > 0 ? Math.floor(body.usesRemaining) : body?.usesRemaining === null ? null : 20;

    // expiresInHours: positive number = TTL; null/missing = 7-day default.
    // Bounded by default so a leaked code can't be redeemed forever.
    const expiresAt =
      typeof body?.expiresInHours === "number" && body.expiresInHours > 0 ? Date.now() + Math.floor(body.expiresInHours) * 60 * 60 * 1000 : Date.now() + 7 * 24 * 60 * 60 * 1000;

    const invite = await storage.invites.create({ spaceId, createdBy: user.id, usesRemaining, expiresAt });
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

  // Admin queue for join requests pending the owner's approval. Only
  // populates when the space's joinPolicy = "approval"; otherwise
  // redemptions skip the queue entirely.
  app.get("/:id/join-requests", async (c) => {
    const user = c.get("user");
    const spaceId = c.req.param("id");
    const m = await storage.memberships.get(spaceId, user.id);
    if (!m || m.role !== "owner") return c.json({ error: "only the owner can view join requests" }, 403);
    const requests = await storage.joinRequests.listPendingForSpace(spaceId);
    return c.json(requests);
  });

  app.post("/:id/join-requests/:reqId/approve", async (c) => {
    const user = c.get("user");
    const spaceId = c.req.param("id");
    const reqId = c.req.param("reqId");
    const m = await storage.memberships.get(spaceId, user.id);
    if (!m || m.role !== "owner") return c.json({ error: "only the owner can approve join requests" }, 403);

    const request = await storage.joinRequests.get(reqId);
    if (!request || request.spaceId !== spaceId) return c.json({ error: "not found" }, 404);
    if (request.status !== "pending") return c.json({ error: `request is ${request.status}` }, 409);

    // Approve = run the same write the "open" path would have run.
    // For user requesters: add a membership row + consume the invite.
    // For guest requesters: mint a session, stash the token on the
    // request row so the joiner's status poll can hand it back. Cookie
    // setting happens on the joiner's response, not here.
    const invite = await storage.invites.get(request.code);
    if (!invite) return c.json({ error: "invite no longer exists" }, 410);

    if (request.requester.kind === "user") {
      const existing = await storage.memberships.get(spaceId, request.requester.userId);
      if (!existing) {
        const consumed = await storage.invites.consume(request.code);
        if (!consumed) return c.json({ error: "invite is no longer valid" }, 410);
        await storage.memberships.add({
          spaceId,
          userId: request.requester.userId,
          username: request.requester.username,
          displayName: request.requester.displayName,
          role: "member",
        });
      }
      const approved = await storage.joinRequests.approve(reqId, null);
      return approved ? c.json(approved) : c.json({ error: "couldn't approve" }, 409);
    }

    // Guest path: mint the session up-front so the waiting room can
    // claim the cookie on its next poll.
    const consumed = await storage.invites.consume(request.code);
    if (!consumed) return c.json({ error: "invite is no longer valid" }, 410);
    const sessionToken = await mintGuestSession(storage, spaceId, request.requester.displayName);
    const approved = await storage.joinRequests.approve(reqId, sessionToken);
    return approved ? c.json(approved) : c.json({ error: "couldn't approve" }, 409);
  });

  app.post("/:id/join-requests/:reqId/deny", async (c) => {
    const user = c.get("user");
    const spaceId = c.req.param("id");
    const reqId = c.req.param("reqId");
    const m = await storage.memberships.get(spaceId, user.id);
    if (!m || m.role !== "owner") return c.json({ error: "only the owner can deny join requests" }, 403);

    const request = await storage.joinRequests.get(reqId);
    if (!request || request.spaceId !== spaceId) return c.json({ error: "not found" }, 404);
    const denied = await storage.joinRequests.setTerminalStatus(reqId, "denied");
    return denied ? c.json(denied) : c.json({ error: `request is ${request.status}` }, 409);
  });

  return app;
}

// Routes for the *joiner's* side of a JoinRequest — checking status,
// cancelling. No auth required: the request id is the bearer token.
// (If you have the id you're whoever submitted it; if you don't you
// can't see it.)
export function buildJoinRequestsRouter(storage: Storage) {
  const app = new Hono();

  // Status poll: the waiting room hits this every 2s while pending,
  // so allow ~90/min comfortably. Worst-case abuse is a poll storm
  // that still can't extract anything since the request id is the
  // requester's own.
  app.get("/:id", rateLimit({ bucket: "join-request-status", max: 90 }), async (c) => {
    const reqId = c.req.param("id");
    const request = await storage.joinRequests.get(reqId);
    if (!request) return c.json({ error: "request not found" }, 404);
    // For approved guest requests, claim the session cookie on first
    // status read — the waiting room is the only entity that hits
    // this and only via its own request id. Setting it once on read
    // is the simplest delivery mechanism.
    if (request.status === "approved" && request.requester.kind === "guest" && request.approvedSessionToken) {
      const { SESSION_COOKIE, sessionCookieOptions } = await import("@/auth.ts");
      const { setCookie } = await import("hono/cookie");
      setCookie(c, SESSION_COOKIE, request.approvedSessionToken, sessionCookieOptions());
    }
    return c.json(request);
  });

  app.post("/:id/cancel", rateLimit({ bucket: "join-request-cancel", max: 10 }), async (c) => {
    const reqId = c.req.param("id");
    const cancelled = await storage.joinRequests.setTerminalStatus(reqId, "cancelled");
    return cancelled ? c.json(cancelled) : c.json({ error: "request not found or already settled" }, 404);
  });

  return app;
}

// Mint a guest session row + token without setting a cookie. Used by
// the approve path so the token can travel through the JoinRequest row
// and the waiting-room status poll picks it up to install the cookie.
async function mintGuestSession(storage: Storage, spaceId: string, displayName: string): Promise<string> {
  const token = generateSessionToken();
  const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 days, matches user sessions
  await storage.sessions.create({
    token,
    userId: null,
    currentSpaceId: spaceId,
    guestDisplayName: displayName,
    expiresAt,
  });
  return token;
}

// Companion routes that don't fit cleanly under /api/spaces.
//   POST /api/invites/redeem        — logged-in user joins a space as member
//   POST /api/invites/redeem-guest  — anonymous visitor joins as a guest
//   POST /api/invites/lookup        — peek at code info before committing
//
// `onJoinRequestCreated` lets the caller (server/index.ts) hook a
// WebSocket notification when a request lands. Optional — routes work
// fine without it; the queue just sits there until an admin polls.
export function buildInvitesRouter(storage: Storage, { onJoinRequestCreated }: { onJoinRequestCreated?: JoinRequestCreatedHook } = {}) {
  const app = new Hono();

  // Lookup is public (no auth required) — the join page calls it to
  // distinguish "code valid, guest type" from "code valid, member type"
  // and adapt its UI. We return minimal info — just kind + space name —
  // to avoid leaking invite usage counts to unauth'd callers.
  // Lookup is the brute-force surface (gates redeem) — more permissive
  // than redeem itself since the user may legitimately retype as they
  // go, but still bounded enough that random-guessing isn't viable.
  app.post("/lookup", rateLimit({ bucket: "invite-lookup", max: 30 }), async (c) => {
    const body = (await c.req.json().catch(() => null)) as { code?: unknown } | null;
    const code = normalizeCode(body?.code);
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
    return c.json({ spaceName: space.name });
  });

  // Authed redeem — any caller with a session joins the invite's space
  // as a member. The recipient's path (member-via-auth vs guest-no-auth)
  // is chosen at the /join page; this endpoint handles the member side.
  //
  // If the space's joinPolicy is "approval", redemption creates a
  // pending JoinRequest instead of admitting immediately; the response
  // signals `{ pending: true, requestId }` so the client can route to
  // the waiting room.
  app.post("/redeem", rateLimit({ bucket: "invite-redeem", max: 10 }), requireUser(storage), async (c) => {
    const user = c.get("user");
    const body = (await c.req.json().catch(() => null)) as { code?: unknown } | null;
    const code = normalizeCode(body?.code);
    if (!code) return c.json({ error: "code is required" }, 400);

    const invite = await storage.invites.get(code);
    if (!invite) {
      console.warn(`[invites] redeem miss (auth=${user.id}, code=${code.slice(0, 3)}…)`);
      return c.json({ error: "invite code not found" }, 404);
    }
    if (invite.expiresAt !== null && invite.expiresAt < Date.now()) {
      return c.json({ error: "invite has expired" }, 410);
    }
    if (invite.usesRemaining !== null && invite.usesRemaining <= 0) {
      return c.json({ error: "invite has no uses remaining" }, 410);
    }

    const existing = await storage.memberships.get(invite.spaceId, user.id);
    if (existing) {
      const space = await storage.spaces.get(invite.spaceId);
      return c.json({ space, alreadyMember: true });
    }

    const space = await storage.spaces.get(invite.spaceId);
    if (!space) return c.json({ error: "space not found" }, 404);

    // Approval gate: don't consume the invite or add a membership yet
    // — just queue a request. The admin's approve action runs the
    // actual join (see /spaces/:id/join-requests/:reqId/approve).
    if (space.joinPolicy === "approval") {
      const request = await storage.joinRequests.create({
        spaceId: space.id,
        code,
        requester: {
          kind: "user",
          userId: user.id,
          username: user.username,
          displayName: user.displayName,
        },
        ttlMs: JOIN_REQUEST_TTL_MS,
      });
      onJoinRequestCreated?.(request);
      return c.json({ pending: true, requestId: request.id, spaceName: space.name });
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
    return c.json({ space, alreadyMember: false });
  });

  // Guest redeem — public. Creates a guest session and sets the cookie
  // identical to a user session, just with userId=null and a chosen
  // display name. Refuses if the caller already has any session — they
  // need to /logout first so we don't accidentally clobber a user session.
  //
  // Same approval gate as /redeem: if the space's policy is "approval",
  // creates a JoinRequest and returns `{ pending: true, requestId }`.
  // The admin's approve action mints the guest session at that point.
  app.post("/redeem-guest", rateLimit({ bucket: "invite-redeem-guest", max: 10 }), async (c) => {
    const existing = await getCurrentPrincipal(c, storage);
    if (existing) {
      return c.json({ error: "you're already signed in — sign out first to join as guest" }, 409);
    }

    const body = (await c.req.json().catch(() => null)) as { code?: unknown; displayName?: unknown } | null;
    const code = normalizeCode(body?.code);
    const rawName = typeof body?.displayName === "string" ? body.displayName.trim() : "";
    if (!code) return c.json({ error: "code is required" }, 400);
    if (!rawName) return c.json({ error: "display name is required" }, 400);
    if (rawName.length > 50) return c.json({ error: "display name is at most 50 characters" }, 400);

    const invite = await storage.invites.get(code);
    if (!invite) {
      console.warn(`[invites] redeem-guest miss (code=${code.slice(0, 3)}…)`);
      return c.json({ error: "invite code not found" }, 404);
    }
    if (invite.expiresAt !== null && invite.expiresAt < Date.now()) {
      return c.json({ error: "invite has expired" }, 410);
    }
    if (invite.usesRemaining !== null && invite.usesRemaining <= 0) {
      return c.json({ error: "invite has no uses remaining" }, 410);
    }

    const space = await storage.spaces.get(invite.spaceId);
    if (!space) return c.json({ error: "space not found" }, 404);

    if (space.joinPolicy === "approval") {
      const request = await storage.joinRequests.create({
        spaceId: space.id,
        code,
        requester: { kind: "guest", displayName: rawName },
        ttlMs: JOIN_REQUEST_TTL_MS,
      });
      onJoinRequestCreated?.(request);
      return c.json({ pending: true, requestId: request.id, spaceName: space.name });
    }

    const consumed = await storage.invites.consume(code);
    if (!consumed) return c.json({ error: "invite is no longer valid" }, 410);

    await startGuestSession(c, storage, invite.spaceId, rawName);
    return c.json({ space, displayName: rawName });
  });

  return app;
}

// Window during which a pending join request remains actionable. Long
// enough to let an admin notice and act; short enough that abandoned
// requests don't clutter the queue.
const JOIN_REQUEST_TTL_MS = 60 * 60 * 1000; // 1 hour

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

// Strip the human-friendly hyphen formatting (`rxkk-zk38` → `rxkkzk38`)
// before lookup. Storage keeps the raw 8-char alphabet form; the
// hyphen is purely a display affordance that helps people read codes
// aloud. Accepts whatever the user pastes — uppercase, spaces, dashes —
// and reduces to the canonical lookup key.
function normalizeCode(input: unknown): string {
  if (typeof input !== "string") return "";
  return input.trim().toLowerCase().replace(/[-\s]/g, "");
}

// Suppress unused-import warning when the type-only import below is
// inferred without explicit reference.
export type Hint = SpaceMember;
