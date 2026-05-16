import { Hono } from "hono";
import { setCookie } from "hono/cookie";

import type { Storage } from "@/storage/index.ts";
import { generateSessionToken, getCurrentPrincipal, requireSpaceMember, SESSION_COOKIE } from "@/auth.ts";

const PAIRING_TTL_MS = 10 * 60 * 1000; // 10 minutes — short enough to limit
                                       // damage if a code is overheard.
const GUEST_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days, same as user sessions
const MAX_DISPLAY_NAME = 50;

// TV-pairing flow for guests joining ad-hoc:
//
//   POST   /api/pairing/start           { displayName }      → { code, expiresAt }
//   GET    /api/pairing/status/:code                          → { status, ... }
//   POST   /api/pairing/approve         { code }              → admit caller's space
//
// The guest's status poll is what activates their session — when the
// pairing is approved we attach the pre-minted session token to the
// response via Set-Cookie. The guest's browser stores the cookie, the
// page redirects to /library, and from there they're a normal guest.
export function buildPairingRouter(storage: Storage) {
  const app = new Hono();

  // Public — anyone can initiate a pairing. The display name is locked in
  // here so the admin doesn't have to type it.
  app.post("/start", async (c) => {
    // Disallow when the caller already has a session — they're either
    // signed in or already guest-paired. Pairing while authed makes
    // no sense and would silently clobber an existing cookie later.
    const principal = await getCurrentPrincipal(c, storage);
    if (principal) {
      return c.json({ error: "you're already signed in — sign out first" }, 409);
    }

    const body = (await c.req.json().catch(() => null)) as { displayName?: unknown } | null;
    const raw = typeof body?.displayName === "string" ? body.displayName.trim() : "";
    if (!raw) return c.json({ error: "display name is required" }, 400);
    if (raw.length > MAX_DISPLAY_NAME) return c.json({ error: `display name is at most ${MAX_DISPLAY_NAME} characters` }, 400);

    const pairing = await storage.pairings.create({ displayName: raw, ttlMs: PAIRING_TTL_MS });
    return c.json({ code: pairing.code, expiresAt: pairing.expiresAt }, 201);
  });

  // Public — guest polls this to discover when an admin admitted them.
  // The first poll after approval is what actually activates the cookie
  // on the guest's browser; we delete the pairing record afterward so
  // the code can't be replayed by a third party who overheard it.
  app.get("/status/:code", async (c) => {
    const code = c.req.param("code");
    const pairing = await storage.pairings.get(code);
    if (!pairing) return c.json({ status: "expired" });

    if (pairing.status !== "approved" || !pairing.sessionToken || !pairing.spaceId) {
      return c.json({ status: "pending", expiresAt: pairing.expiresAt });
    }

    // Approved — set the cookie now, on the GUEST's response (this is the
    // whole reason for the poll-driven design — the admin can't set a
    // cookie on a different browser).
    setCookie(c, SESSION_COOKIE, pairing.sessionToken, {
      httpOnly: true,
      sameSite: "Lax",
      secure: cookieSecure(),
      path: "/",
      expires: new Date(Date.now() + GUEST_SESSION_TTL_MS),
    });
    // Consume so the code can't be re-used.
    await storage.pairings.consume(code).catch(() => undefined);
    return c.json({
      status: "approved",
      displayName: pairing.displayName,
      spaceName: pairing.spaceName,
    });
  });

  // Admin admits a guest into their currently-active space. Mints the
  // guest session here so it's ready by the time the guest's next poll
  // arrives.
  app.post("/approve", requireSpaceMember(storage), async (c) => {
    const body = (await c.req.json().catch(() => null)) as { code?: unknown } | null;
    const raw = typeof body?.code === "string" ? body.code.trim().replace(/\D/g, "") : "";
    if (!raw) return c.json({ error: "code is required" }, 400);
    if (raw.length !== 8) return c.json({ error: "code must be 8 digits" }, 400);

    const existing = await storage.pairings.get(raw);
    if (!existing) return c.json({ error: "code not found or expired" }, 404);
    if (existing.status !== "pending") return c.json({ error: "code already used" }, 409);

    const space = c.get("space");
    const token = generateSessionToken();
    const expiresAt = Date.now() + GUEST_SESSION_TTL_MS;
    await storage.sessions.create({
      token,
      userId: null,
      currentSpaceId: space.id,
      guestDisplayName: existing.displayName,
      expiresAt,
    });

    const approved = await storage.pairings.approve(raw, {
      spaceId: space.id,
      spaceName: space.name,
      sessionToken: token,
    });
    if (!approved) {
      // Lost the race — another approver got there first, or it expired
      // between our get() and approve(). Roll back the session we minted.
      await storage.sessions.deleteByToken(token).catch(() => undefined);
      return c.json({ error: "code is no longer valid" }, 410);
    }

    return c.json({ displayName: existing.displayName, spaceName: space.name });
  });

  return app;
}

function cookieSecure(): boolean {
  const raw = process.env.COOKIE_SECURE;
  if (raw === undefined) return process.env.NODE_ENV === "production";
  return raw !== "false" && raw !== "0";
}
