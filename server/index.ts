import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ServerWebSocket } from "bun";
import { Hono } from "hono";

import { type ChatMoment, type Collection, type ClientMessage, type ReactionContent, type ServerMessage } from "@/protocol.ts";
import {
  broadcastChat,
  broadcastJoinRequestPending,
  broadcastPresence,
  broadcastReaction,
  broadcastState,
  broadcastViewers,
  getOrCreateSession,
  getSession,
  removeSocket,
  startChatRetentionSweeper,
  viewersOf,
  type Session,
  type WsData,
} from "@/sessions.ts";
import { createStorage } from "@/storage/index.ts";
import { resolveCollection } from "@/storage/collection-resolver.ts";
import { buildVideosRouter } from "@/api/videos.ts";
import { buildHealthRouter } from "@/api/health.ts";
import { buildProbeRouter } from "@/api/probe.ts";
import { buildSubtitleProxyRouter } from "@/api/subtitle_proxy.ts";
import { buildAuthRouter } from "@/api/auth.ts";
import { buildAccountStorageRouter } from "@/api/account_storage.ts";
import { buildSpaceStorageRouter } from "@/api/space_storage.ts";
import { buildStorageSecretRouter } from "@/api/storage_secret.ts";
import { buildCollectionsRouter } from "@/api/collections.ts";
import { buildSharesRouter } from "@/api/shares.ts";
import { buildPublicShareRouter } from "@/api/public_share.ts";
import { buildChatRouter } from "@/api/chat.ts";
import { buildInvitesRouter, buildJoinRequestsRouter, buildSessionSpaceRouter, buildSpacesRouter } from "@/api/spaces.ts";
import { buildSessionMembersRouter, buildSessionStateRouter } from "@/api/session_state.ts";
import { getCurrentPrincipalFromRequest } from "@/auth.ts";
import { assertEncryptionKey } from "@/crypto.ts";
import { ensureHomeSpace } from "@/spaces.ts";
import { runCollectionMigration } from "@/migrate-collections.ts";
import { PlaylistModel } from "@/models/index.ts";

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
startChatRetentionSweeper(storage);

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
    await PlaylistModel.updateMany({ ownerId: user.id }, { $set: { spaceId: home.id, createdBy: user.id }, $unset: { ownerId: "" } });
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
    `[roomflix] storage migration: moved ${migrated} legacy config(s) → connections` + (skipped > 0 ? ` (skipped ${skipped} orphan row(s) whose space no longer exists)` : ""),
  );
}
await runStorageMigration();

// Convert any pre-unification playlists / albums into the unified
// `collections` (idempotent — see migrate-collections.ts).
await runCollectionMigration(storage);

const app = new Hono();

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
app.route("/api/collections", buildCollectionsRouter(storage));
app.route("/api/shares", buildSharesRouter(storage));
// Public, unauthenticated — share-link redemption. Mounted at the
// singular /api/share so it never collides with the authed /api/shares.
app.route("/api/share", buildPublicShareRouter(storage));
app.route("/api/spaces/:id/chat", buildChatRouter(storage));

// SPA fallback.
app.all("*", async (c) => {
  if (!HAS_CLIENT_BUILD) {
    return c.text("roomflix server running. Start the Vite dev server for the UI.");
  }
  const path = c.req.path === "/" ? "/index.html" : c.req.path;
  const file = Bun.file(join(CLIENT_DIST, path));
  if (await file.exists()) return new Response(file);
  return new Response(Bun.file(join(CLIENT_DIST, "index.html")));
});

// Seed the session's current-item fields from a collection item.
// Subtitles are pulled from a matching Library entry when one exists, so a
// video item that's also a saved library video keeps its captions.
// `playing` is set true (autoplay) — harmless for photo items, which
// ignore it.
async function applyCollectionItem(session: Session, collection: Collection, index: number): Promise<void> {
  const item = collection.items[index];
  session.state.collectionIndex = index;
  session.state.currentTime = 0;
  // Every item swap invalidates the prior duration.
  session.state.duration = null;
  if (!item) {
    session.state.videoUrl = null;
    session.state.videoTitle = null;
    session.state.subtitles = [];
    session.state.playing = false;
    return;
  }
  session.state.videoUrl = item.url;
  session.state.videoTitle = item.name?.trim() || null;
  session.state.playing = true;
  const entry = await storage.videos.findByUrl(session.spaceId, item.url).catch(() => null);
  session.state.subtitles = entry ? entry.subtitles : [];
}

// Next index in `direction`. Wraps when loop is on; returns null when the
// step would run off an end with loop off.
function stepCollectionIndex(current: number, direction: 1 | -1, count: number, loop: boolean): number | null {
  if (count === 0) return null;
  const next = current + direction;
  if (next < 0 || next >= count) return loop ? (next + count) % count : null;
  return next;
}

// Reactions: allowed quick-bar emojis, max text length, and a sliding
// per-socket rate-limit window (8 / 10s). Validation drops anything off
// the allow-list silently; rate-limited drops are also silent.
const ALLOWED_REACTION_EMOJI = new Set(["😂", "❤️", "🔥", "😮", "👏", "😭", "🍿", "👀"]);
const REACTION_MAX_TEXT_LEN = 140;
const REACTION_WINDOW_MS = 10_000;
const REACTION_MAX_IN_WINDOW = 8;
const reactionWindows = new WeakMap<ServerWebSocket<WsData>, number[]>();

function validateReaction(raw: unknown): ReactionContent | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { kind?: unknown; emoji?: unknown; text?: unknown };
  if (r.kind === "emoji" && typeof r.emoji === "string" && ALLOWED_REACTION_EMOJI.has(r.emoji)) {
    return { kind: "emoji", emoji: r.emoji };
  }
  if (r.kind === "text" && typeof r.text === "string") {
    const trimmed = r.text.trim().slice(0, REACTION_MAX_TEXT_LEN);
    if (trimmed) return { kind: "text", text: trimmed };
  }
  return null;
}

// Server-computed expected playback time — used when /remote sends
// play/pause without a currentTime (it has no live player to read).
function expectedCurrentTime(session: Session, now: number): number {
  const elapsed = (now - session.state.updatedAt) / 1000;
  return session.state.currentTime + (session.state.playing ? Math.max(0, elapsed) : 0);
}

function validateMoment(raw: unknown): ChatMoment | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Record<string, unknown>;
  if (typeof m.videoUrl !== "string" || !m.videoUrl.trim()) return null;
  if (typeof m.currentTime !== "number" || !Number.isFinite(m.currentTime)) return null;
  return {
    videoUrl: m.videoUrl.trim(),
    currentTime: Math.max(0, m.currentTime),
    mediaTitle: typeof m.mediaTitle === "string" ? m.mediaTitle.trim() : "",
    collectionId: typeof m.collectionId === "string" && m.collectionId ? m.collectionId : null,
    collectionIndex: typeof m.collectionIndex === "number" && Number.isFinite(m.collectionIndex) ? Math.floor(m.collectionIndex) : null,
  };
}

async function handleChat(ws: ServerWebSocket<WsData>, rawText: unknown, rawMoment: unknown): Promise<void> {
  const text = typeof rawText === "string" ? rawText.trim().slice(0, REACTION_MAX_TEXT_LEN) : "";
  const moment = validateMoment(rawMoment);
  // Either text or a moment must be present — a fully empty message is
  // a no-op.
  if (!text && !moment) return;
  // Share the reaction rate-limit window — chat + reactions count
  // against the same quota so a spammer can't bypass by mixing.
  const now = Date.now();
  const window = (reactionWindows.get(ws) ?? []).filter((t) => now - t < REACTION_WINDOW_MS);
  if (window.length >= REACTION_MAX_IN_WINDOW) return;
  window.push(now);
  reactionWindows.set(ws, window);
  const stored = await storage.chat.add({
    spaceId: ws.data.spaceId,
    senderId: ws.data.identityId,
    senderKind: ws.data.identityKind,
    senderName: ws.data.displayName,
    text,
    moment,
  });
  broadcastChat(ws.data.spaceId, stored);
}

function handleReaction(ws: ServerWebSocket<WsData>, raw: unknown): void {
  const reaction = validateReaction(raw);
  if (!reaction) return;
  const now = Date.now();
  const window = (reactionWindows.get(ws) ?? []).filter((t) => now - t < REACTION_WINDOW_MS);
  if (window.length >= REACTION_MAX_IN_WINDOW) return;
  window.push(now);
  reactionWindows.set(ws, window);
  broadcastReaction(ws.data.spaceId, {
    reaction,
    sender: { id: ws.data.identityId, name: ws.data.displayName },
    clientId: ws.data.clientId,
    sentAt: now,
  });
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

  // Reactions are ephemeral fan-out — no playback state change, no
  // broadcastState. Handled (with rate-limiting + validation) inline.
  if (message.type === "reaction") {
    handleReaction(ws, message.reaction);
    return;
  }

  // Persistent chat — server stores + broadcasts to everyone in the
  // space. Like reactions, doesn't touch playback state.
  if (message.type === "chat") {
    await handleChat(ws, message.text, message.moment);
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
      // currentTime is optional — the remote-control surface has no
      // live player, so we fall back to the room's expected time.
      session.state.currentTime = message.currentTime ?? expectedCurrentTime(session, now);
      session.state.playing = true;
      break;
    case "pause":
      session.state.currentTime = message.currentTime ?? expectedCurrentTime(session, now);
      session.state.playing = false;
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
      session.state.collectionId = null;
      session.state.collectionIndex = 0;
      // New URL → previous duration is stale; the watcher will repost
      // on loadedmetadata.
      session.state.duration = null;
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
    case "loadCollection": {
      const raw = await storage.collections.get(session.spaceId, message.collectionId);
      if (!raw) return;
      const collection = await resolveCollection(raw, storage);
      session.state.collectionId = collection.id;
      await applyCollectionItem(session, collection, 0);
      break;
    }
    case "collectionNext":
    case "collectionPrev": {
      if (!session.state.collectionId) return;
      const raw = await storage.collections.getById(session.state.collectionId);
      if (!raw || raw.spaceId !== session.spaceId) return;
      const collection = await resolveCollection(raw, storage);
      const direction = message.type === "collectionNext" ? 1 : -1;
      const target = stepCollectionIndex(session.state.collectionIndex, direction, collection.items.length, session.state.collectionLoop);
      if (target === null) {
        session.state.playing = false;
        break;
      }
      await applyCollectionItem(session, collection, target);
      break;
    }
    case "collectionJumpTo": {
      if (!session.state.collectionId) return;
      const raw = await storage.collections.getById(session.state.collectionId);
      if (!raw || raw.spaceId !== session.spaceId) return;
      const collection = await resolveCollection(raw, storage);
      const idx = Math.floor(message.index);
      if (idx < 0 || idx >= collection.items.length) return;
      await applyCollectionItem(session, collection, idx);
      break;
    }
    case "setCollectionLoop":
      session.state.collectionLoop = !!message.loop;
      break;
    case "setDuration": {
      // Only the active watcher really knows the duration. Sanity-check
      // the number; ignore NaN / Infinity / negatives.
      const d = message.duration;
      if (d === null) session.state.duration = null;
      else if (typeof d === "number" && Number.isFinite(d) && d > 0) session.state.duration = d;
      else return;
      break;
    }
    case "jumpTo": {
      const m = validateMoment(message.moment);
      if (!m) return;
      if (m.collectionId) {
        const collection = await storage.collections.getById(m.collectionId);
        if (!collection || collection.spaceId !== session.spaceId) return;
        // Always set the collection context (covers both "load fresh"
        // and "stay in this collection but jump items").
        session.state.collectionId = collection.id;
        const idx = m.collectionIndex ?? 0;
        if (idx < 0 || idx >= collection.items.length) return;
        await applyCollectionItem(session, collection, idx);
      } else {
        // Standalone media — clear any collection context and load the
        // referenced URL. Hydrate library metadata when we have a row
        // for the URL; otherwise fall back to the moment's snapshot
        // title.
        if (session.state.videoUrl !== m.videoUrl) {
          const entry = await storage.videos.findByUrl(session.spaceId, m.videoUrl).catch(() => null);
          session.state.videoUrl = m.videoUrl;
          session.state.videoTitle = entry?.title ?? m.mediaTitle ?? null;
          session.state.subtitles = entry?.subtitles ?? [];
          session.state.duration = null;
        }
        session.state.collectionId = null;
        session.state.collectionIndex = 0;
      }
      session.state.currentTime = Math.max(0, m.currentTime);
      session.state.playing = true;
      break;
    }
    case "videoEnded": {
      if (message.endedUrl !== session.state.videoUrl) return;
      if (!session.state.collectionId) {
        session.state.playing = false;
        break;
      }
      const raw = await storage.collections.getById(session.state.collectionId);
      if (!raw || raw.spaceId !== session.spaceId) {
        session.state.playing = false;
        break;
      }
      const collection = await resolveCollection(raw, storage);
      const target = stepCollectionIndex(session.state.collectionIndex, 1, collection.items.length, session.state.collectionLoop);
      if (target === null) {
        session.state.playing = false;
        break;
      }
      await applyCollectionItem(session, collection, target);
      break;
    }
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
      const displayName = principal.kind === "user" ? principal.user.displayName?.trim() || `@${principal.user.username}` : principal.session.guestDisplayName?.trim() || "Guest";

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
