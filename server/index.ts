import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ServerWebSocket } from "bun";
import { Hono } from "hono";

import { type ClientMessage, type ServerMessage } from "@/protocol.ts";
import {
  broadcastJoinRequestPending,
  broadcastPresence,
  broadcastState,
  broadcastViewers,
  getOrCreateSession,
  getSession,
  removeSocket,
  viewersOf,
  type Session,
  type WsData,
} from "@/sessions.ts";
import { createStorage } from "@/storage/index.ts";
import { buildVideosRouter } from "@/api/videos.ts";
import { buildHealthRouter } from "@/api/health.ts";
import { buildProbeRouter } from "@/api/probe.ts";
import { buildSubtitleProxyRouter } from "@/api/subtitle_proxy.ts";
import { buildAuthRouter } from "@/api/auth.ts";
import { buildAccountStorageRouter } from "@/api/account_storage.ts";
import { buildSpaceStorageRouter } from "@/api/space_storage.ts";
import { buildStorageSecretRouter } from "@/api/storage_secret.ts";
import { buildPlaylistsRouter } from "@/api/playlists.ts";
import {
  buildInvitesRouter,
  buildJoinRequestsRouter,
  buildSessionSpaceRouter,
  buildSpacesRouter,
} from "@/api/spaces.ts";
import { buildSessionMembersRouter, buildSessionStateRouter } from "@/api/session_state.ts";
import { getCurrentPrincipalFromRequest } from "@/auth.ts";
import { assertEncryptionKey } from "@/crypto.ts";
import { ensureHomeSpace } from "@/spaces.ts";

const PORT = Number(process.env.PORT ?? 3000);
const IS_PROD = process.env.NODE_ENV === "production";
const MONGO_URL = process.env.MONGO_URL;

const CLIENT_DIST = join(import.meta.dir, "..", "client", "dist");
const HAS_CLIENT_BUILD = existsSync(CLIENT_DIST);

if (!MONGO_URL) {
  console.error("[roomflix] MONGO_URL is required — point it at a MongoDB instance (Atlas, local, etc.)");
  process.exit(1);
}

try {
  assertEncryptionKey();
} catch (err) {
  console.error(`[roomflix] ${(err as Error).message}`);
  process.exit(1);
}

const storage = await createStorage(MONGO_URL);

// Phase-4 boot migration: every existing user gets a Home space and any
// pre-spaces data (videos, playlists, imports, storage config) reparents
// onto that space. Idempotent — users who already have a membership are
// skipped.
async function runSpaceMigration(): Promise<void> {
  const users = await storage.users.listAll();
  let migrated = 0;
  for (const user of users) {
    const existing = await storage.memberships.listForUser(user.id);
    if (existing.length > 0) continue;
    const home = await ensureHomeSpace(storage, user);
    await storage.videos.reparent(user.id, home.id);
    await storage.playlists.reparent(user.id, home.id);
    migrated++;
  }
  if (migrated > 0) console.log(`[roomflix] reparented ${migrated} legacy user(s) into Home spaces`);
}
await runSpaceMigration();

// One-shot migration: every legacy `storage_configs` row (keyed by
// spaceId from the previous schema) → a new account-level
// `storage_connections` row owned by the space's owner, auto-activated
// in that same space. Marks the legacy row as migrated so a re-run is
// a no-op. The legacy doc itself stays in place for now — easy to
// inspect if anything goes wrong; can be dropped later.
async function runStorageMigration(): Promise<void> {
  const legacy = await storage.storageConfigs.listUnmigrated();
  if (legacy.length === 0) return;
  let migrated = 0;
  let skipped = 0;
  for (const row of legacy) {
    const space = await storage.spaces.get(row._legacyKey);
    if (!space) {
      skipped++;
      continue;
    }
    const conn = await storage.storageConnections.create({
      ownerId: space.ownerId,
      label: row.label?.trim() || `${row.provider}/${row.bucket}`,
      provider: row.provider,
      accountId: row.accountId,
      bucket: row.bucket,
      accessKeyId: row.accessKeyId,
      secretAccessKey: row.secretAccessKey,
      publicBaseUrl: row.publicBaseUrl,
      maxBytes: row.maxBytes,
    });
    await storage.storageActivations.add({ connectionId: conn.id, spaceId: space.id });
    await storage.storageConfigs.markMigrated(row._legacyKey);
    migrated++;
  }
  console.log(
    `[roomflix] storage migration: moved ${migrated} legacy config(s) → connections` +
      (skipped > 0 ? ` (skipped ${skipped} orphan row(s) whose space no longer exists)` : ""),
  );
}
await runStorageMigration();

const app = new Hono();

// CORS for cross-origin clients (e.g. the GitHub Pages mirror).
// CORS_ORIGINS is a comma-separated allowlist; empty/unset = no CORS
// (same-origin only, current behavior). The middleware echoes the
// allowed origin back and includes Access-Control-Allow-Credentials
// so the session cookie travels.
const corsOrigins = (process.env.CORS_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
if (corsOrigins.length > 0) {
  const { cors } = await import("hono/cors");
  app.use(
    "/api/*",
    cors({
      origin: (origin) => (corsOrigins.includes(origin) ? origin : null),
      credentials: true,
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type"],
      maxAge: 3600,
    }),
  );
  console.log(`[roomflix] CORS enabled for ${corsOrigins.join(", ")}`);
}

app.get("/healthz", (c) => c.text("ok"));

app.route("/api/auth", buildAuthRouter(storage));
// More-specific /api/spaces/:id/storage MUST come before the general
// /api/spaces mount — otherwise Hono routes through the spaces router
// first and its `requireUser` middleware 401s the request before it
// can fall through to space_storage.
app.route("/api/spaces/:id/storage", buildSpaceStorageRouter(storage));
app.route("/api/spaces", buildSpacesRouter(storage));
app.route(
  "/api/invites",
  buildInvitesRouter(storage, {
    // Fan a soft WS nudge to any sockets already in the space so an
    // online admin's pending-requests list refreshes without waiting
    // for a poll.
    onJoinRequestCreated: (req) => broadcastJoinRequestPending(req.spaceId),
  }),
);
app.route("/api/join-requests", buildJoinRequestsRouter(storage));
app.route("/api/session/space", buildSessionSpaceRouter(storage));
app.route("/api/session/state", buildSessionStateRouter(storage));
app.route("/api/session/members", buildSessionMembersRouter(storage));
app.route("/api/videos", buildVideosRouter(storage));
app.route("/api/library/health", buildHealthRouter(storage));
app.route("/api/library/probe", buildProbeRouter(storage));
app.route("/api/library/subtitle", buildSubtitleProxyRouter(storage));
app.route("/api/account/storage", buildAccountStorageRouter(storage));
app.route("/api/storage/secret", buildStorageSecretRouter(storage));
app.route("/api/playlists", buildPlaylistsRouter(storage));

// Toggle: when set, the server stops serving the bundled client and
// 302s every non-API/non-WS request to STATIC_REDIRECT_URL with the
// original path + query preserved. Use this to shift static asset
// load to GitHub Pages (or any other static host) without rebuilding
// the container. Flip it off in env to fall back to local serving.
const STATIC_REDIRECT_URL = (process.env.STATIC_REDIRECT_URL ?? "").replace(/\/$/, "");
if (STATIC_REDIRECT_URL) {
  console.log(`[roomflix] STATIC_REDIRECT_URL set — / and assets will 302 to ${STATIC_REDIRECT_URL}`);
}

// SPA fallback (or 302 if the redirect toggle is on).
app.all("*", async (c) => {
  if (STATIC_REDIRECT_URL) {
    const url = new URL(c.req.url);
    return c.redirect(`${STATIC_REDIRECT_URL}${url.pathname}${url.search}`, 302);
  }
  if (!HAS_CLIENT_BUILD) {
    return c.text("roomflix server running. Start the Vite dev server for the UI.");
  }
  const path = c.req.path === "/" ? "/index.html" : c.req.path;
  const file = Bun.file(join(CLIENT_DIST, path));
  if (await file.exists()) return new Response(file);
  return new Response(Bun.file(join(CLIENT_DIST, "index.html")));
});

async function applyVideoToSession(session: Session, videoId: string, opts: { autoplay: boolean }): Promise<void> {
  const video = await storage.videos.get(session.spaceId, videoId);
  if (!video) {
    session.state.videoUrl = null;
    session.state.videoTitle = null;
    session.state.subtitles = [];
    session.state.playing = false;
    session.state.currentTime = 0;
    return;
  }
  session.state.videoUrl = video.url;
  session.state.videoTitle = video.title;
  session.state.subtitles = video.subtitles;
  session.state.currentTime = 0;
  session.state.playing = opts.autoplay;
}

// Walk a playlist in `direction` (+1 forward, -1 backward) starting from
// `fromIndex`, skipping ids whose library entry has been deleted. Loop
// wraps once at the end; without loop, we clamp.
async function findPlayableIndex(
  videoIds: string[],
  fromIndex: number,
  direction: 1 | -1,
  spaceId: string,
  loop: boolean,
): Promise<{ index: number; videoId: string } | null> {
  if (videoIds.length === 0) return null;
  let i = fromIndex;
  for (let step = 0; step < videoIds.length; step++) {
    i += direction;
    if (i < 0 || i >= videoIds.length) {
      if (!loop) return null;
      i = (i + videoIds.length) % videoIds.length;
    }
    const id = videoIds[i]!;
    const video = await storage.videos.get(spaceId, id);
    if (video) return { index: i, videoId: id };
  }
  return null;
}

async function findFirstPlayable(videoIds: string[], spaceId: string): Promise<{ index: number; videoId: string } | null> {
  for (let i = 0; i < videoIds.length; i++) {
    const id = videoIds[i]!;
    const video = await storage.videos.get(spaceId, id);
    if (video) return { index: i, videoId: id };
  }
  return null;
}

async function handleClientMessage(ws: ServerWebSocket<WsData>, message: ClientMessage) {
  const session = getSession(ws.data.spaceId);
  if (!session) return;
  const now = Date.now();

  // setStatus is presence-only, never touches playback state — handled
  // before the switch so we can short-circuit the trailing broadcastState
  // (which would otherwise stamp updatedAt for a non-playback event).
  if (message.type === "setStatus") {
    const next = message.status === "watching" ? "watching" : "online";
    const prev = ws.data.status;
    if (next === prev) return;
    ws.data.status = next;
    // Leaving /watch clears the per-tab volume — they're no longer
    // running a player. Saves stale "muted" badges from showing for
    // users who muted, switched pages, and stayed offline.
    if (next === "online") {
      ws.data.volume = undefined;
      ws.data.volumeUpdatedAt = undefined;
    }
    broadcastPresence(ws.data.spaceId);
    // Viewers set changes whenever a socket crosses the watching line.
    broadcastViewers(ws.data.spaceId);
    return;
  }

  // Volume updates are presence-only too. Cheap to no-op when nothing
  // actually changed — saves redundant broadcasts during slider drags
  // that happen to repeat the same value (debounce isn't perfect).
  if (message.type === "setVolume") {
    const level = Math.max(0, Math.min(1, Number(message.level) || 0));
    const muted = !!message.muted;
    const prev = ws.data.volume;
    if (prev && prev.level === level && prev.muted === muted) return;
    ws.data.volume = { level, muted };
    ws.data.volumeUpdatedAt = now;
    broadcastPresence(ws.data.spaceId);
    return;
  }

  switch (message.type) {
    case "hello":
      return;
    case "play":
      session.state.playing = true;
      session.state.currentTime = message.currentTime;
      break;
    case "pause":
      session.state.playing = false;
      session.state.currentTime = message.currentTime;
      break;
    case "seek":
      session.state.currentTime = message.currentTime;
      break;
    case "setUrl":
      session.state.videoUrl = message.videoUrl;
      session.state.currentTime = 0;
      // Setting a URL is "I want to watch this" — start playing
      // immediately rather than landing in a paused-with-cover state.
      // Mirrors loadPlaylist's autoplay:true semantics.
      session.state.playing = true;
      session.state.playlistId = null;
      session.state.playlistIndex = 0;
      // Auto-save into the space library (idempotent on url) so everyone
      // in the space sees the title + subtitles, not just the setter.
      try {
        const entry = await storage.videos.create({ spaceId: session.spaceId, addedBy: ws.data.userId, url: message.videoUrl });
        session.state.videoTitle = entry.title;
        session.state.subtitles = entry.subtitles;
      } catch (err) {
        console.error("[roomflix] library lookup failed", err);
        session.state.videoTitle = null;
        session.state.subtitles = [];
      }
      break;
    case "loadPlaylist": {
      const playlist = await storage.playlists.get(session.spaceId, message.playlistId);
      if (!playlist) return;
      session.state.playlistId = playlist.id;
      session.state.playlistIndex = 0;
      const first = playlist.videoIds.length > 0 ? await findFirstPlayable(playlist.videoIds, session.spaceId) : null;
      if (first) {
        session.state.playlistIndex = first.index;
        await applyVideoToSession(session, first.videoId, { autoplay: true });
      } else {
        session.state.videoUrl = null;
        session.state.videoTitle = null;
        session.state.subtitles = [];
        session.state.playing = false;
        session.state.currentTime = 0;
      }
      break;
    }
    case "playlistNext":
    case "playlistPrev": {
      if (!session.state.playlistId) return;
      const playlist = await storage.playlists.getById(session.state.playlistId);
      if (!playlist || playlist.spaceId !== session.spaceId) return;
      const direction = message.type === "playlistNext" ? 1 : -1;
      const target = await findPlayableIndex(playlist.videoIds, session.state.playlistIndex, direction, session.spaceId, session.state.playlistLoop);
      if (!target) {
        session.state.playing = false;
        break;
      }
      session.state.playlistIndex = target.index;
      await applyVideoToSession(session, target.videoId, { autoplay: true });
      break;
    }
    case "playlistJumpTo": {
      if (!session.state.playlistId) return;
      const playlist = await storage.playlists.getById(session.state.playlistId);
      if (!playlist || playlist.spaceId !== session.spaceId) return;
      const idx = Math.floor(message.index);
      if (idx < 0 || idx >= playlist.videoIds.length) return;
      const id = playlist.videoIds[idx]!;
      const video = await storage.videos.get(session.spaceId, id);
      if (!video) return;
      session.state.playlistIndex = idx;
      await applyVideoToSession(session, id, { autoplay: true });
      break;
    }
    case "videoEnded": {
      if (message.endedUrl !== session.state.videoUrl) return;
      if (!session.state.playlistId) {
        session.state.playing = false;
        break;
      }
      const playlist = await storage.playlists.getById(session.state.playlistId);
      if (!playlist || playlist.spaceId !== session.spaceId) {
        session.state.playing = false;
        break;
      }
      const target = await findPlayableIndex(playlist.videoIds, session.state.playlistIndex, 1, session.spaceId, session.state.playlistLoop);
      if (!target) {
        session.state.playing = false;
        break;
      }
      session.state.playlistIndex = target.index;
      await applyVideoToSession(session, target.videoId, { autoplay: true });
      break;
    }
    case "setPlaylistLoop":
      session.state.playlistLoop = !!message.loop;
      break;
  }

  session.state.updatedAt = now;
  session.state.updatedBy = ws.data.clientId;
  broadcastState(ws.data.spaceId);
}

const server = Bun.serve<WsData>({
  port: PORT,
  async fetch(req, srv) {
    const url = new URL(req.url);

    // WebSocket upgrade: /ws?client=<id>. The space comes from the
    // session's currentSpaceId — works for both user sessions and guest
    // sessions. Everyone in the same space joins the same playback session.
    if (url.pathname === "/ws") {
      const clientId = url.searchParams.get("client");
      if (!clientId) return new Response("missing client id", { status: 400 });

      const principal = await getCurrentPrincipalFromRequest(req, storage);
      if (!principal) {
        console.warn("[roomflix] ws upgrade rejected: no principal (missing/expired/unknown cookie)");
        return new Response("unauthorized", { status: 401 });
      }

      const spaceId = principal.session.currentSpaceId;
      if (!spaceId) {
        console.warn(`[roomflix] ws upgrade rejected: no active space (principal=${principal.kind})`);
        return new Response("no active space", { status: 409 });
      }

      if (principal.kind === "user") {
        const member = await storage.memberships.get(spaceId, principal.user.id);
        if (!member) {
          console.warn(`[roomflix] ws upgrade rejected: user ${principal.user.id} not a member of ${spaceId}`);
          return new Response("not a member of this space", { status: 403 });
        }
      }
      // Guests are admitted as long as the session's currentSpaceId is
      // set (it's stamped at redeem time and can't be changed by them).

      // userId for WsData is either the real user id or the guest's
      // session token — both stable per-principal IDs for attribution.
      const userId = principal.kind === "user" ? principal.user.id : principal.session.token;

      // Identity for the viewers list. For users, prefer displayName but
      // fall back to "@username" so the chip is never blank. For guests,
      // use guestDisplayName (set at redeem time); also has a
      // defensive fallback in case it's somehow empty.
      const identityKind: "user" | "guest" = principal.kind === "user" ? "user" : "guest";
      const identityId = principal.kind === "user" ? principal.user.id : principal.session.token;
      const displayName =
        principal.kind === "user"
          ? principal.user.displayName?.trim() || `@${principal.user.username}`
          : principal.session.guestDisplayName?.trim() || "Guest";

      // Initial presence status. Pre-presence-aware clients (legacy
      // /watch hook) don't send the query param — they default to
      // "watching" so existing behavior is preserved. The new global
      // socket on dashboard/library will pass ?status=online.
      const rawStatus = url.searchParams.get("status");
      const status: "online" | "watching" = rawStatus === "online" ? "online" : "watching";

      const guestJoinedAt = principal.kind === "guest" ? principal.session.createdAt : undefined;
      const ok = srv.upgrade(req, {
        data: { spaceId, clientId, userId, identityId, identityKind, displayName, status, guestJoinedAt },
      });
      return ok ? undefined : new Response("upgrade failed", { status: 500 });
    }

    return app.fetch(req);
  },
  websocket: {
    open(ws) {
      const session = getOrCreateSession(ws.data.spaceId);
      session.sockets.add(ws);
      console.log(`[roomflix] ws open: space=${ws.data.spaceId} userId=${ws.data.userId} status=${ws.data.status} sockets=${session.sockets.size}`);
      const snapshot: ServerMessage = { type: "state", state: session.state, viewers: viewersOf(session), serverTime: Date.now() };
      ws.send(JSON.stringify(snapshot));
      // Seed the just-opened socket with the current presence list,
      // then fan out the change to everyone else (handled by the global
      // broadcast — it sends to the new socket too, which is fine).
      broadcastPresence(ws.data.spaceId);
      // Only re-broadcast viewer count if this socket joined as a
      // watcher — pure observers don't affect the watcher set.
      if (ws.data.status === "watching") broadcastViewers(ws.data.spaceId);
    },
    async message(ws, raw) {
      if (typeof raw !== "string") return;
      let parsed: ClientMessage;
      try {
        parsed = JSON.parse(raw) as ClientMessage;
      } catch {
        return;
      }
      await handleClientMessage(ws, parsed);
    },
    close(ws, code, reason) {
      const session = getSession(ws.data.spaceId);
      console.log(`[roomflix] ws close: space=${ws.data.spaceId} userId=${ws.data.userId} code=${code} reason=${reason || "<none>"} remaining=${(session?.sockets.size ?? 1) - 1}`);
      if (!session) return;
      removeSocket(session, ws);
      // Presence always changes on disconnect; viewers only if the
      // departing socket was watching. We broadcast both unconditionally
      // since the cost is negligible and it keeps the dropdown's "N
      // watching · M online" counts in sync without branching.
      broadcastPresence(ws.data.spaceId);
      broadcastViewers(ws.data.spaceId);
    },
  },
});

console.log(
  `[roomflix] ${IS_PROD ? "prod" : "dev"} server on http://localhost:${server.port}` + (HAS_CLIENT_BUILD ? " (serving client/dist)" : " (no client build; use Vite dev server)"),
);
