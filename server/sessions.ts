import type { ServerWebSocket } from "bun";
import {
  emptySessionState,
  type ChatMessage,
  type Participant,
  type PresenceStatus,
  type ReactionContent,
  type ServerMessage,
  type SessionState,
  type SpaceMember,
  type Video,
  type Viewer,
  type Volume,
} from "@/protocol.ts";
import type { Storage } from "@/storage/index.ts";

// One playback session per space — replaces the old per-room model.
// Everyone in the same space shares the same session; switching spaces
// switches sessions.
//
// Persistence: the live `state` lives in memory for snappy access, but
// every mutation is mirrored to Mongo (debounced ~250ms) and a 2s
// heartbeat keeps `currentTime` fresh while playing. On boot, the
// first WS hit for a space triggers `hydrateSession` which loads the
// last snapshot. Restored state is forced to playing=false so viewers
// explicitly resume after downtime — no surprise audio from a room
// the user walked away from.

// `identityId` is what we dedupe viewers by — real user id for users,
// guest session token for guests. Multiple tabs from the same person
// collapse to one viewer. `userId` is kept distinct because it's used
// by some legacy paths (e.g. videos.create's addedBy); for users they're
// equal, for guests userId is also the session token.
//
// `status` is mutable — the client toggles it via setStatus when
// entering/leaving /watch. Default at upgrade is "watching" so the
// legacy /watch-only client continues to be counted as a viewer
// without any client-side change.
export type WsData = {
  spaceId: string;
  clientId: string;
  userId: string;
  identityId: string;
  identityKind: "user" | "guest";
  displayName: string;
  status: PresenceStatus;
  // Last reported volume from this socket. Only meaningful for sockets
  // with status "watching"; for others it's set to undefined.
  volume?: Volume;
  // When the volume was last set. Used to break ties when one identity
  // has multiple watching tabs — most recent intent wins.
  volumeUpdatedAt?: number;
  // For guests only: when their session was created. Surfaced as
  // Participant.guestJoinedAt so the detail modal can show "paired
  // 2h ago". Users' join time lives in space_members, fetched
  // separately by the client.
  guestJoinedAt?: number;
};

export type Session = {
  spaceId: string;
  state: SessionState;
  sockets: Set<ServerWebSocket<WsData>>;
  // Timer that deletes the session after it has been empty for a grace
  // period. Mirrors the old room sweeper.
  emptySince: number | null;
};

const sessions = new Map<string, Session>();
const EMPTY_TTL_MS = 5 * 60 * 1000;

// Storage reference for persistence calls — attached at boot by
// index.ts. Module scope keeps callers (schedulePersist, the heartbeat)
// from threading it through every state-mutating path.
let _storage: Storage | null = null;
export function attachStorage(storage: Storage): void {
  _storage = storage;
}

export function getOrCreateSession(spaceId: string): Session {
  let s = sessions.get(spaceId);
  if (!s) {
    s = { spaceId, state: emptySessionState(), sockets: new Set(), emptySince: null };
    sessions.set(spaceId, s);
  }
  s.emptySince = null;
  return s;
}

// Async variant that pulls the last persisted state out of Mongo on
// first miss for a space. Returns the live session (whether it was
// already in memory or freshly hydrated). Always sets playing=false on
// hydration — viewers tap Play to resume.
export async function hydrateSession(spaceId: string): Promise<Session> {
  const existing = sessions.get(spaceId);
  if (existing) {
    existing.emptySince = null;
    return existing;
  }
  const snapshot = _storage ? await _storage.sessionState.get(spaceId).catch(() => null) : null;
  const initial = snapshot
    ? {
        ...snapshot,
        playing: false,
        updatedAt: Date.now(),
        updatedBy: null,
      }
    : emptySessionState();
  const session: Session = { spaceId, state: initial, sockets: new Set(), emptySince: null };
  sessions.set(spaceId, session);
  return session;
}

// Debounced persistence — collapses bursts of mutations (e.g. a viewer
// scrubs rapidly) into one write per ~250ms window.
const persistTimers = new Map<string, ReturnType<typeof setTimeout>>();
export function schedulePersist(spaceId: string): void {
  if (!_storage) return;
  const existing = persistTimers.get(spaceId);
  if (existing) clearTimeout(existing);
  persistTimers.set(
    spaceId,
    setTimeout(() => {
      persistTimers.delete(spaceId);
      const session = sessions.get(spaceId);
      if (!session || !_storage) return;
      _storage.sessionState.put(spaceId, session.state).catch((err) => {
        console.error("[roomflix] session-state persist failed", err);
      });
    }, 250),
  );
}

// 2s heartbeat — for every playing session, re-anchor currentTime to
// "now" (mathematically transparent for sync calc) and persist. Means
// a server crash mid-playback loses at most 2s of position. Doesn't
// broadcast — the re-anchor is purely server-side bookkeeping. Also
// keeps the active watch-history row's lastPosition fresh, and opens
// an entry when one is missing (e.g. just after a state hydration).
export function startPersistHeartbeat(intervalMs = 2000): void {
  setInterval(() => {
    if (!_storage) return;
    const now = Date.now();
    for (const session of sessions.values()) {
      if (!session.state.playing) continue;
      const elapsed = (now - session.state.updatedAt) / 1000;
      if (elapsed <= 0) continue;
      session.state.currentTime = session.state.currentTime + elapsed;
      session.state.updatedAt = now;
      schedulePersist(session.spaceId);

      const active = activeHistoryBySpace.get(session.spaceId);
      if (active) {
        _storage.watchHistory.updatePosition(active.id, session.state.currentTime).catch(() => undefined);
      } else if (session.state.videoUrl) {
        // Playing but no row open — usually means we just hydrated and
        // a viewer hit Play before any URL-change mutation. Open one.
        void openHistoryEntry(session, null);
      }
    }
  }, intervalMs);
}

// ── Watch history ──────────────────────────────────────────────────────
// One in-memory pointer per space at the currently-open history row.
// All transitions go through `openHistoryEntry` / `closeHistoryEntry`
// so callers don't have to track the row id themselves.

// The active row's id may be the literal string `__pending__` for a
// brief window between "we decided to open a row" and "the DB returned
// an id" — that sentinel lets concurrent callers (URL-change handler
// vs heartbeat) see that a row is already in flight and bail instead
// of racing to insert two rows for the same item.
const PENDING_ID = "__pending__";
const activeHistoryBySpace = new Map<string, { id: string; videoUrl: string }>();

export async function openHistoryEntry(session: Session, collectionTitle: string | null): Promise<void> {
  if (!_storage || !session.state.videoUrl) return;
  const spaceId = session.spaceId;
  const url = session.state.videoUrl;

  // Already open (or in flight) for this exact URL — no-op. Catches
  // the heartbeat firing while a URL-change open is still resolving.
  const existing = activeHistoryBySpace.get(spaceId);
  if (existing && existing.videoUrl === url) return;

  // Claim the slot SYNCHRONOUSLY before any await so concurrent calls
  // see the pending marker and bail out. We swap the marker for the
  // real id once the insert resolves.
  activeHistoryBySpace.set(spaceId, { id: PENDING_ID, videoUrl: url });

  // Close any prior row (different URL — same-URL case bailed above).
  // Drop the marker if close fails so the bail-out doesn't leak.
  if (existing && existing.id !== PENDING_ID) {
    let lastPosition = 0;
    const elapsed = session.state.playing ? Math.max(0, (Date.now() - session.state.updatedAt) / 1000) : 0;
    lastPosition = Math.max(0, session.state.currentTime + elapsed);
    try {
      await _storage.watchHistory.close(existing.id, lastPosition, false);
    } catch (err) {
      console.error("[roomflix] history close failed", err);
    }
  }

  try {
    const entry = await _storage.watchHistory.add({
      spaceId,
      videoUrl: url,
      videoTitle: session.state.videoTitle,
      collectionId: session.state.collectionId,
      collectionTitle,
      collectionIndex: session.state.collectionId ? session.state.collectionIndex : null,
      duration: session.state.duration,
    });
    // Only overwrite if our marker is still the active one — a more
    // recent open (different URL) shouldn't be clobbered.
    const current = activeHistoryBySpace.get(spaceId);
    if (current?.id === PENDING_ID && current.videoUrl === url) {
      activeHistoryBySpace.set(spaceId, { id: entry.id, videoUrl: url });
    }
  } catch (err) {
    // Back the marker out so the next caller can retry.
    const current = activeHistoryBySpace.get(spaceId);
    if (current?.id === PENDING_ID && current.videoUrl === url) {
      activeHistoryBySpace.delete(spaceId);
    }
    console.error("[roomflix] history open failed", err);
  }
}

// Drop the in-memory active-history pointer for a space without
// touching the DB. Called by the bulk-clear endpoint after wiping
// rows; the next URL change opens a fresh row cleanly.
export function clearActiveHistoryEntry(spaceId: string): void {
  activeHistoryBySpace.delete(spaceId);
}

export async function closeHistoryEntry(spaceId: string, completed: boolean): Promise<void> {
  const active = activeHistoryBySpace.get(spaceId);
  if (!active || !_storage) return;
  // A pending marker means a concurrent open is still resolving — bail
  // rather than calling close() on the sentinel id.
  if (active.id === PENDING_ID) return;
  activeHistoryBySpace.delete(spaceId);
  // Compute position at the moment of close — playing rooms may have
  // ticked since the last state mutation.
  const session = sessions.get(spaceId);
  let lastPosition = 0;
  if (session) {
    const elapsed = session.state.playing ? Math.max(0, (Date.now() - session.state.updatedAt) / 1000) : 0;
    lastPosition = Math.max(0, session.state.currentTime + elapsed);
  }
  try {
    await _storage.watchHistory.close(active.id, lastPosition, completed);
  } catch (err) {
    console.error("[roomflix] history close failed", err);
  }
}

export function getSession(spaceId: string): Session | undefined {
  return sessions.get(spaceId);
}

// Library edits happen over REST while playback state is synchronized over
// WebSocket. If the edited entry is currently loaded, refresh the metadata in
// the live session immediately so every viewer sees title/subtitle changes
// without having to unload and reload the video. Playback timing is left
// untouched because this is metadata-only.
export function syncActiveLibraryEntry(spaceId: string, entry: Pick<Video, "url" | "title" | "subtitles">): boolean {
  const session = sessions.get(spaceId);
  if (!session || session.state.videoUrl !== entry.url) return false;

  session.state.videoTitle = entry.title;
  session.state.subtitles = [...entry.subtitles];
  broadcastState(spaceId);
  schedulePersist(spaceId);
  return true;
}

export function removeSocket(session: Session, ws: ServerWebSocket<WsData>) {
  session.sockets.delete(ws);
  if (session.sockets.size === 0) session.emptySince = Date.now();
}

// Watchers only — sockets whose status === "watching". This is the
// "currently in the /watch tab" set. Deduped by identity (multiple
// watching tabs from one person collapse to one entry).
export function viewersOf(session: Session): Viewer[] {
  const out = new Map<string, Viewer>();
  for (const ws of session.sockets) {
    if (ws.data.status !== "watching") continue;
    const { identityId, identityKind, displayName } = ws.data;
    if (out.has(identityId)) continue;
    out.set(identityId, { id: identityId, kind: identityKind, displayName });
  }
  return Array.from(out.values());
}

// Everyone connected to the space, deduped by identity. When an
// identity has multiple tabs in different states, the most-engaged
// status wins ("watching" > "online") — so a dashboard tab + a watch
// tab from the same person shows as "watching" once.
//
// Volume is set only for watching identities. With multiple watching
// tabs, the tab with the most recent setVolume wins — matches user
// intent on the device they last touched.
export function participantsOf(session: Session): Participant[] {
  // First pass: pick the winning watching socket per identity (latest
  // volumeUpdatedAt) and capture base presence.
  const tabsByIdentity = new Map<string, ServerWebSocket<WsData>[]>();
  for (const ws of session.sockets) {
    const list = tabsByIdentity.get(ws.data.identityId);
    if (list) list.push(ws);
    else tabsByIdentity.set(ws.data.identityId, [ws]);
  }

  const out: Participant[] = [];
  for (const [id, tabs] of tabsByIdentity) {
    const anyWatching = tabs.find((t) => t.data.status === "watching");
    const status: PresenceStatus = anyWatching ? "watching" : "online";
    const head = anyWatching ?? tabs[0]!;

    let volume: Volume | undefined;
    if (status === "watching") {
      // Pick the watching tab with the latest volume update; falls back
      // to any tab's volume if none have been set explicitly yet.
      const watching = tabs.filter((t) => t.data.status === "watching" && t.data.volume);
      watching.sort((a, b) => (b.data.volumeUpdatedAt ?? 0) - (a.data.volumeUpdatedAt ?? 0));
      volume = watching[0]?.data.volume;
    }

    // Per-status tab count for the detail modal.
    let watchingCount = 0;
    let onlineCount = 0;
    for (const t of tabs) {
      if (t.data.status === "watching") watchingCount++;
      else onlineCount++;
    }

    // For guests, surface the earliest guestJoinedAt across their
    // tabs (i.e. when the originating session was created).
    let guestJoinedAt: number | undefined;
    if (head.data.identityKind === "guest") {
      for (const t of tabs) {
        const v = t.data.guestJoinedAt;
        if (v && (guestJoinedAt === undefined || v < guestJoinedAt)) guestJoinedAt = v;
      }
    }

    out.push({
      id,
      kind: head.data.identityKind,
      displayName: head.data.displayName,
      status,
      ...(volume ? { volume } : {}),
      tabs: {
        total: tabs.length,
        watching: watchingCount,
        online: onlineCount,
      },
      ...(guestJoinedAt !== undefined ? { guestJoinedAt } : {}),
    });
  }
  return out;
}

// Called when a space is deleted — kicks every live socket and removes the
// session immediately so connected clients get a clean close rather than
// keep sending into a phantom space.
export function endSessionForSpace(spaceId: string): void {
  const s = sessions.get(spaceId);
  if (!s) return;
  for (const ws of s.sockets) {
    try {
      ws.close(1000, "space deleted");
    } catch {
      // ignore — socket may already be closing
    }
  }
  sessions.delete(spaceId);
}

export function sweepEmptySessions() {
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (s.sockets.size === 0 && s.emptySince && now - s.emptySince > EMPTY_TTL_MS) {
      sessions.delete(id);
    }
  }
}

setInterval(sweepEmptySessions, 60_000);

// Per-space chat retention — keep the last N messages, sweep hourly.
// Called by index.ts once storage is constructed.
export function startChatRetentionSweeper(
  storage: { chat: { distinctSpaceIds(): Promise<string[]>; trim(spaceId: string, keepLast: number): Promise<number> } },
  keepLast = 500,
  intervalMs = 60 * 60 * 1000,
) {
  const run = async () => {
    try {
      const ids = await storage.chat.distinctSpaceIds();
      for (const sid of ids) await storage.chat.trim(sid, keepLast);
    } catch (err) {
      console.error("[roomflix] chat retention sweep failed", err);
    }
  };
  setInterval(run, intervalMs);
}

// ── Broadcast helpers ──────────────────────────────────────────────────
//
// Centralized here so api routes (e.g. /me) can fan out side effects
// without importing from index.ts and creating a cycle.

export function broadcastState(spaceId: string): void {
  const session = getSession(spaceId);
  if (!session) return;
  const message: ServerMessage = { type: "state", state: session.state, viewers: viewersOf(session), serverTime: Date.now() };
  const payload = JSON.stringify(message);
  for (const ws of session.sockets) ws.send(payload);
}

export function broadcastViewers(spaceId: string): void {
  const session = getSession(spaceId);
  if (!session) return;
  const payload = JSON.stringify({ type: "viewers", viewers: viewersOf(session) } satisfies ServerMessage);
  for (const ws of session.sockets) ws.send(payload);
}

export function broadcastPresence(spaceId: string): void {
  const session = getSession(spaceId);
  if (!session) return;
  const payload = JSON.stringify({ type: "presence", participants: participantsOf(session) } satisfies ServerMessage);
  for (const ws of session.sockets) ws.send(payload);
}

// Nudge any sockets currently connected to a space that a new join
// request is waiting on the admin queue. The payload is intentionally
// minimal — clients refetch the pending list on receipt. Non-owners
// in the channel get the message too; their UI just ignores it (the
// pending-list endpoint is owner-gated).
// Fan a reaction out to every socket currently "watching" in the space.
// Skipped for "online" sockets — reactions are a live-theater concern,
// not a general space chat.
export function broadcastReaction(spaceId: string, payload: { reaction: ReactionContent; sender: { id: string; name: string }; clientId: string; sentAt: number }): void {
  const session = getSession(spaceId);
  if (!session) return;
  const message: ServerMessage = { type: "reaction", ...payload };
  const wire = JSON.stringify(message);
  for (const ws of session.sockets) {
    if (ws.data.status === "watching") ws.send(wire);
  }
}

// Fan a chat message out to EVERY socket in the space, not just
// "watching" ones — the remote-control page joins the session without
// flipping to watching status but still needs to see chat live.
export function broadcastChat(spaceId: string, message: ChatMessage): void {
  const session = getSession(spaceId);
  if (!session) return;
  const payload = JSON.stringify({ type: "chat", message } satisfies ServerMessage);
  for (const ws of session.sockets) ws.send(payload);
}

// Owner just wiped the chat — tell every socket in the space so the
// remote sidebars / overlays reset their local thread immediately.
export function broadcastChatCleared(spaceId: string): void {
  const session = getSession(spaceId);
  if (!session) return;
  const payload = JSON.stringify({ type: "chatCleared" } satisfies ServerMessage);
  for (const ws of session.sockets) ws.send(payload);
}

export function broadcastJoinRequestPending(spaceId: string): void {
  const session = getSession(spaceId);
  if (!session) return;
  const payload = JSON.stringify({ type: "joinRequestPending", spaceId } satisfies ServerMessage);
  for (const ws of session.sockets) ws.send(payload);
}

function broadcastMemberUpdated(spaceId: string, member: SpaceMember): void {
  const session = getSession(spaceId);
  if (!session) return;
  const payload = JSON.stringify({ type: "memberUpdated", member } satisfies ServerMessage);
  for (const ws of session.sockets) ws.send(payload);
}

// ── Cross-session propagation for identity-level changes ────────────────

// A real user changed their displayName. We need to:
//   1. Patch every live socket's WsData.displayName for this userId
//      (so viewersOf / participantsOf reflect the new name immediately)
//   2. Broadcast `presence` to every space the user is connected to
//   3. Broadcast `memberUpdated` to every space where they're a member
//      (covers REST-cached members lists in offline-aware UIs)
//
// `newDisplayName` is the resolved label including the "@username"
// fallback when the user cleared their displayName — caller computes it.
export async function propagateUserDisplayName(userId: string, newDisplayName: string, storage: Storage): Promise<void> {
  const affected = new Set<string>();
  for (const session of sessions.values()) {
    for (const ws of session.sockets) {
      if (ws.data.identityKind === "user" && ws.data.userId === userId) {
        ws.data.displayName = newDisplayName;
        affected.add(session.spaceId);
      }
    }
  }
  for (const spaceId of affected) {
    broadcastPresence(spaceId);
    const member = await storage.memberships.get(spaceId, userId);
    if (member) broadcastMemberUpdated(spaceId, member);
  }
}

// A guest renamed themselves. Guests only have one session by design,
// so this is much simpler — find the matching socket, patch displayName,
// rebroadcast presence in their single space. No memberUpdated since
// guests aren't in the member roster.
export function propagateGuestDisplayName(sessionToken: string, newDisplayName: string): void {
  for (const session of sessions.values()) {
    for (const ws of session.sockets) {
      if (ws.data.identityKind === "guest" && ws.data.identityId === sessionToken) {
        ws.data.displayName = newDisplayName;
        broadcastPresence(session.spaceId);
        return;
      }
    }
  }
}
