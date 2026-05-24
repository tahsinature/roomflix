import { Hono } from "hono";

import type { GuestIdentity, SpaceSummary } from "@/protocol.ts";
import type { Storage } from "@/storage/index.ts";
import { endSession, getCurrentPrincipal, hashPassword, requireUser, startSession, toAuthUser, verifyPassword } from "@/auth.ts";
import { propagateGuestDisplayName, propagateUserDisplayName } from "@/sessions.ts";
import { ensureHomeSpace, listSpaceSummaries, resolveDefaultSpaceId } from "@/spaces.ts";

const USERNAME_RE = /^[a-zA-Z0-9_-]{3,32}$/;
const MIN_PASSWORD_LENGTH = 8;
const MAX_DISPLAY_NAME = 50;
const MAX_CITY = 80;
// IANA timezones are area/location with a few exceptions. Keep the
// validator loose — anything obviously not a tz name is rejected, but
// we don't ship the full canonical list. The client picks from
// Intl.supportedValuesOf("timeZone") on modern runtimes.
const TIMEZONE_RE = /^[A-Za-z]+(?:[/_+\-][A-Za-z0-9_+\-]+)*$/;
const ALLOWED_BEZELS = new Set(["cinema", "crt", "minimal"]);

// REST routes for authentication.
//   POST   /api/auth/register       { username, password } → AuthUser (logs in)
//   POST   /api/auth/login          { username, password } → AuthUser
//   POST   /api/auth/logout                                  → 204
//   GET    /api/auth/me                                       → AuthUser (real users only)
//   PATCH  /api/auth/me             { displayName? }          → AuthUser | GuestIdentity
//   GET    /api/auth/session                                   → { user, guest, registrationAllowed, currentSpaceId, spaces }
export function buildAuthRouter(storage: Storage) {
  const app = new Hono();

  app.post("/register", async (c) => {
    if (!registrationAllowed()) {
      const existingCount = await storage.users.count();
      if (existingCount > 0) {
        return c.json({ error: "registration is disabled" }, 403);
      }
    }

    const body = (await c.req.json().catch(() => null)) as { username?: unknown; password?: unknown } | null;
    const username = typeof body?.username === "string" ? body.username.trim() : "";
    const password = typeof body?.password === "string" ? body.password : "";

    if (!USERNAME_RE.test(username)) {
      return c.json({ error: "username must be 3-32 chars (letters, numbers, _, -)" }, 400);
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      return c.json({ error: `password must be at least ${MIN_PASSWORD_LENGTH} characters` }, 400);
    }

    const existing = await storage.users.findByUsername(username);
    if (existing) return c.json({ error: "username already taken" }, 409);

    const isFirstUser = (await storage.users.count()) === 0;
    const passwordHash = await hashPassword(password);
    const user = await storage.users.create({ username, passwordHash, isAdmin: isFirstUser });

    const home = await ensureHomeSpace(storage, user);
    await startSession(c, storage, user.id, home.id);
    return c.json(toAuthUser(user), 201);
  });

  app.post("/login", async (c) => {
    const body = (await c.req.json().catch(() => null)) as { username?: unknown; password?: unknown } | null;
    const username = typeof body?.username === "string" ? body.username.trim() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    if (!username || !password) return c.json({ error: "username and password are required" }, 400);

    const user = await storage.users.findByUsername(username);
    const hashToCheck = user?.passwordHash ?? DUMMY_HASH;
    const ok = await verifyPassword(password, hashToCheck);
    if (!user || !ok) return c.json({ error: "invalid credentials" }, 401);

    const defaultSpaceId = await resolveDefaultSpaceId(storage, user.id);
    await startSession(c, storage, user.id, defaultSpaceId);
    return c.json(toAuthUser(user));
  });

  // Single logout endpoint covers both users and guests — it just clears
  // whatever session the cookie points at. Guests calling this leaves
  // their space and ends their session entirely.
  app.post("/logout", async (c) => {
    await endSession(c, storage);
    return c.body(null, 204);
  });

  // /me: real users only — guests have no account, so this 401s for them.
  // For "show me my current identity (user or guest)," clients use /session.
  app.get("/me", requireUser(storage), (c) => c.json(c.get("user")));

  // PATCH /me works for both flavors. For users it updates the persistent
  // user record + fans out to memberships. For guests it updates the
  // session row's guestDisplayName in place (no fan-out — no membership
  // rows to update). Same shape on the wire: { displayName }.
  app.patch("/me", async (c) => {
    const principal = await getCurrentPrincipal(c, storage);
    if (!principal) return c.json({ error: "unauthorized" }, 401);

    const body = (await c.req.json().catch(() => null)) as
      | { displayName?: unknown; timezone?: unknown; city?: unknown; homeBezelStyle?: unknown }
      | null;
    const parsed = parseDisplayName(body);
    if (!parsed.ok) return c.json({ error: parsed.error }, 400);
    const tz = parseTimezone(body);
    if (!tz.ok) return c.json({ error: tz.error }, 400);
    const city = parseCity(body);
    if (!city.ok) return c.json({ error: city.error }, 400);
    const bezel = parseBezel(body);
    if (!bezel.ok) return c.json({ error: bezel.error }, 400);

    if (principal.kind === "user") {
      const updated = await storage.users.updateProfile(principal.user.id, {
        displayName: parsed.value,
        timezone: tz.value,
        city: city.value,
        homeBezelStyle: bezel.value,
      });
      if (!updated) return c.json({ error: "not found" }, 404);
      if (parsed.value !== undefined) {
        await storage.memberships.updateDisplayNameForUser(updated.id, parsed.value);
        // Resolved label = preferred displayName, falling back to "@username".
        // Must match the resolution the WS upgrade does so live WsData and
        // member rows stay consistent.
        const label = updated.displayName?.trim() || `@${updated.username}`;
        await propagateUserDisplayName(updated.id, label, storage);
      }
      // Denormalize timezone/city onto space-member rows so member panels
      // render local time + city without a per-row user fetch.
      if (tz.value !== undefined || city.value !== undefined) {
        await storage.memberships.updateLocationForUser(updated.id, {
          timezone: tz.value,
          city: city.value,
        });
      }
      return c.json(toAuthUser(updated));
    }

    // Guest path. Empty display name isn't allowed — they must always
    // have one. The validator catches null/empty above; we reject here
    // explicitly so guests can't unset their identity to "" by mistake.
    if (parsed.value === null) {
      return c.json({ error: "guests must have a display name" }, 400);
    }
    if (parsed.value !== undefined) {
      await storage.sessions.setGuestDisplayName(principal.session.token, parsed.value);
      propagateGuestDisplayName(principal.session.token, parsed.value);
    }
    const next: GuestIdentity = {
      id: principal.session.token,
      displayName: parsed.value ?? principal.session.guestDisplayName ?? "",
      spaceId: principal.session.currentSpaceId ?? "",
    };
    return c.json(next);
  });

  // Identity probe used by the client on every page load. Always returns
  // 200 with the resolved principal — the client renders accordingly.
  app.get("/session", async (c) => {
    const principal = await getCurrentPrincipal(c, storage);

    if (!principal) {
      return c.json({
        user: null,
        guest: null,
        registrationAllowed: registrationAllowed(),
        currentSpaceId: null,
        spaces: [] as SpaceSummary[],
      });
    }

    if (principal.kind === "user") {
      const spaces = await listSpaceSummaries(storage, principal.user.id);
      return c.json({
        user: toAuthUser(principal.user),
        guest: null,
        registrationAllowed: registrationAllowed(),
        currentSpaceId: principal.session.currentSpaceId,
        spaces,
      });
    }

    // Guest: surface just the one space they're locked to. spaces[] is
    // populated with that single summary so the client's space-aware UI
    // doesn't see an empty list (which would normally route them to the
    // "no active space" state).
    const space = principal.session.currentSpaceId ? await storage.spaces.get(principal.session.currentSpaceId) : null;
    const guest: GuestIdentity = {
      id: principal.session.token,
      displayName: principal.session.guestDisplayName ?? "",
      spaceId: principal.session.currentSpaceId ?? "",
    };
    return c.json({
      user: null,
      guest,
      registrationAllowed: registrationAllowed(),
      currentSpaceId: principal.session.currentSpaceId,
      spaces: space ? [{ id: space.id, name: space.name, role: "member" as const }] : [],
    });
  });

  return app;
}

type DisplayNameParse = { ok: true; value: string | null | undefined } | { ok: false; error: string };

function parseDisplayName(body: { displayName?: unknown } | null): DisplayNameParse {
  if (!body || !("displayName" in body)) return { ok: true, value: undefined };
  const raw = body.displayName;
  if (raw === null) return { ok: true, value: null };
  if (typeof raw !== "string") return { ok: false, error: "displayName must be a string or null" };
  const trimmed = raw.trim();
  if (trimmed.length > MAX_DISPLAY_NAME) return { ok: false, error: `display name is at most ${MAX_DISPLAY_NAME} characters` };
  return { ok: true, value: trimmed === "" ? null : trimmed };
}

type StringParse = { ok: true; value: string | null | undefined } | { ok: false; error: string };

// "Absent" key → undefined (no change). Explicit null → clear. Empty
// string → also clear (so the form can wipe the field). Same calling
// shape as parseDisplayName for consistency.
function parseTimezone(body: { timezone?: unknown } | null): StringParse {
  if (!body || !("timezone" in body)) return { ok: true, value: undefined };
  const raw = body.timezone;
  if (raw === null) return { ok: true, value: null };
  if (typeof raw !== "string") return { ok: false, error: "timezone must be a string or null" };
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: true, value: null };
  if (trimmed.length > 64 || !TIMEZONE_RE.test(trimmed)) return { ok: false, error: "timezone must be a valid IANA name" };
  return { ok: true, value: trimmed };
}

function parseCity(body: { city?: unknown } | null): StringParse {
  if (!body || !("city" in body)) return { ok: true, value: undefined };
  const raw = body.city;
  if (raw === null) return { ok: true, value: null };
  if (typeof raw !== "string") return { ok: false, error: "city must be a string or null" };
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: true, value: null };
  if (trimmed.length > MAX_CITY) return { ok: false, error: `city is at most ${MAX_CITY} characters` };
  return { ok: true, value: trimmed };
}

type BezelParse = { ok: true; value: "cinema" | "crt" | "minimal" | null | undefined } | { ok: false; error: string };

function parseBezel(body: { homeBezelStyle?: unknown } | null): BezelParse {
  if (!body || !("homeBezelStyle" in body)) return { ok: true, value: undefined };
  const raw = body.homeBezelStyle;
  if (raw === null) return { ok: true, value: null };
  if (typeof raw !== "string" || !ALLOWED_BEZELS.has(raw)) return { ok: false, error: "homeBezelStyle must be cinema, crt, or minimal" };
  return { ok: true, value: raw as "cinema" | "crt" | "minimal" };
}

function registrationAllowed(): boolean {
  const raw = process.env.ALLOW_REGISTRATION;
  if (raw === undefined) return true;
  return raw !== "false" && raw !== "0";
}

// A real argon2id hash of a fixed dummy string. We compare against this when
// the looked-up user doesn't exist so the timing of the failure looks the
// same as a wrong-password failure. Generated once at module load.
const DUMMY_HASH = await Bun.password.hash("dummy-password-for-constant-time-compare", { algorithm: "argon2id" });
