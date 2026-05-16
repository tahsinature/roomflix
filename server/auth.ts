import type { Context, MiddlewareHandler } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";

import type { AuthUser, Space, SpaceRole } from "@/protocol.ts";
import type { Session, Storage, StoredUser } from "@/storage/types.ts";

export const SESSION_COOKIE = "rf_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// Bun's built-in password hashing — argon2id, with strong defaults. No
// native deps, no bcrypt headaches in Alpine images.
export async function hashPassword(plain: string): Promise<string> {
  return Bun.password.hash(plain, { algorithm: "argon2id" });
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  try {
    return await Bun.password.verify(plain, hash);
  } catch {
    return false;
  }
}

// 256 bits of randomness, hex-encoded. Stored as-is in Mongo and as the
// cookie value — opaque, server-only lookup, no signing needed.
export function generateSessionToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// Mints a new user-tied session, persists it, and sets the cookie.
export async function startSession(c: Context, storage: Storage, userId: string, currentSpaceId: string | null): Promise<void> {
  const token = generateSessionToken();
  const expiresAt = Date.now() + SESSION_TTL_MS;
  await storage.sessions.create({ token, userId, currentSpaceId, guestDisplayName: null, expiresAt });
  writeSessionCookie(c, token, expiresAt);
}

// Mints a guest session — no user record, displayName picked at redeem
// time, currentSpaceId locked to the invited space. Cookie + record share
// the same token, identical to user sessions.
export async function startGuestSession(c: Context, storage: Storage, spaceId: string, displayName: string): Promise<void> {
  const token = generateSessionToken();
  const expiresAt = Date.now() + SESSION_TTL_MS;
  await storage.sessions.create({ token, userId: null, currentSpaceId: spaceId, guestDisplayName: displayName, expiresAt });
  writeSessionCookie(c, token, expiresAt);
}

function writeSessionCookie(c: Context, token: string, expiresAt: number) {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "Lax",
    secure: cookieSecure(),
    path: "/",
    expires: new Date(expiresAt),
  });
}

// Reverse of startSession — drop the cookie and the DB row.
export async function endSession(c: Context, storage: Storage): Promise<void> {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) {
    await storage.sessions.deleteByToken(token).catch(() => undefined);
  }
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
}

// Look up the current user from the session cookie. Null when the cookie
// is missing, the session is unknown/expired, the user no longer exists,
// OR the session is a guest session (no userId). Used by requireUser
// which only admits actual user accounts.
export async function getCurrentUser(c: Context, storage: Storage): Promise<StoredUser | null> {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return null;
  const session = await storage.sessions.findByToken(token);
  if (!session || !session.userId) return null;
  const user = await storage.users.findById(session.userId);
  return user ?? null;
}

// Resolve the active principal — either a real user or a guest. Used by
// requireSpaceMember which lets guests in too.
export type Principal =
  | { kind: "user"; user: StoredUser; session: Session }
  | { kind: "guest"; session: Session };

export async function getCurrentPrincipal(c: Context, storage: Storage): Promise<Principal | null> {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return null;
  const session = await storage.sessions.findByToken(token);
  if (!session) return null;
  if (session.userId) {
    const user = await storage.users.findById(session.userId);
    if (!user) return null;
    return { kind: "user", user, session };
  }
  if (session.guestDisplayName && session.currentSpaceId) {
    return { kind: "guest", session };
  }
  return null;
}

// Raw-Request variant for the WebSocket upgrade path.
export async function getCurrentPrincipalFromRequest(req: Request, storage: Storage): Promise<Principal | null> {
  const token = parseCookieHeader(req.headers.get("cookie"), SESSION_COOKIE);
  if (!token) return null;
  const session = await storage.sessions.findByToken(token);
  if (!session) return null;
  if (session.userId) {
    const user = await storage.users.findById(session.userId);
    if (!user) return null;
    return { kind: "user", user, session };
  }
  if (session.guestDisplayName && session.currentSpaceId) {
    return { kind: "guest", session };
  }
  return null;
}

// Hono middleware: rejects guests AND logged-out callers. For routes that
// inherently require a real user account (e.g. profile editing, space
// management).
export function requireUser(storage: Storage): MiddlewareHandler {
  return async (c, next) => {
    const user = await getCurrentUser(c, storage);
    if (!user) return c.json({ error: "unauthorized" }, 401);
    c.set("user", toAuthUser(user));
    c.set("isGuest", false);
    await next();
  };
}

// Like requireUser, but also accepts guest sessions. Both flavors get
// `spaceRole = "member"` (or "owner" for actual owners) so existing
// permission checks Just Work for guests as well. c.var.isGuest lets a
// route distinguish when it matters (e.g. attribution).
//
// For guests, c.var.user is populated with a synthetic AuthUser whose id
// is the session token — gives addedBy/createdBy/startedBy a stable
// per-guest-session attribution handle without forking every route's code.
export function requireSpaceMember(storage: Storage): MiddlewareHandler {
  return async (c, next) => {
    const principal = await getCurrentPrincipal(c, storage);
    if (!principal) return c.json({ error: "unauthorized" }, 401);

    const spaceId = principal.session.currentSpaceId;
    if (!spaceId) return c.json({ error: "no active space" }, 409);

    const space = await storage.spaces.get(spaceId);
    if (!space) return c.json({ error: "space not found" }, 404);

    if (principal.kind === "user") {
      const member = await storage.memberships.get(spaceId, principal.user.id);
      if (!member) return c.json({ error: "you are not a member of this space" }, 403);
      c.set("user", toAuthUser(principal.user));
      c.set("space", space);
      c.set("spaceRole", member.role);
      c.set("isGuest", false);
    } else {
      // Guest path. Build a synthetic AuthUser so route handlers that
      // do `c.get("user").id` continue to work without branching.
      const synthetic: AuthUser = {
        id: principal.session.token,
        username: "guest",
        displayName: principal.session.guestDisplayName,
        isAdmin: false,
        createdAt: principal.session.createdAt,
      };
      c.set("user", synthetic);
      c.set("space", space);
      c.set("spaceRole", "member");
      c.set("isGuest", true);
    }
    await next();
  };
}

// Sugar for owner-gated routes. Layer after requireSpaceMember. Guests
// always 403 here because they're "member" role regardless.
export function requireSpaceOwner(): MiddlewareHandler {
  return async (c, next) => {
    if (c.get("spaceRole") !== "owner") {
      return c.json({ error: "only the space owner can do that" }, 403);
    }
    await next();
  };
}

// Block guests from a route entirely — used by /api/spaces management
// surfaces where guests have no business.
export function requireRealUser(): MiddlewareHandler {
  return async (c, next) => {
    if (c.get("isGuest")) {
      return c.json({ error: "guests can't do that" }, 403);
    }
    await next();
  };
}

// Convenience: strip passwordHash before serialization. Routes that respond
// with user info call this — never serialize StoredUser directly.
export function toAuthUser(user: StoredUser): AuthUser {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    isAdmin: user.isAdmin,
    createdAt: user.createdAt,
  };
}

// Type augmentation for c.get(...). Routes guarded by requireUser get
// user + isGuest=false. Routes guarded by requireSpaceMember get
// user (real OR synthetic), space, spaceRole, and isGuest.
declare module "hono" {
  interface ContextVariableMap {
    user: AuthUser;
    space: Space;
    spaceRole: SpaceRole;
    isGuest: boolean;
  }
}

function cookieSecure(): boolean {
  const raw = process.env.COOKIE_SECURE;
  if (raw === undefined) return process.env.NODE_ENV === "production";
  return raw !== "false" && raw !== "0";
}

// Minimal RFC 6265 cookie-header parser — picks out one named value. Hono's
// helper isn't available outside a Context, and we need this on the raw
// Bun WS upgrade path.
function parseCookieHeader(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const key = part.slice(0, eq).trim();
    if (key !== name) continue;
    return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return null;
}
