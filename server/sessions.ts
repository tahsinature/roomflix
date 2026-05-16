import type { ServerWebSocket } from "bun";
import {
  emptySessionState,
  type Participant,
  type PresenceStatus,
  type ServerMessage,
  type SessionState,
  type SpaceMember,
  type Viewer,
  type Volume,
} from "@/protocol.ts";
import type { Storage } from "@/storage/index.ts";

// One playback session per space — replaces the old per-room model.
// Everyone in the same space shares the same session; switching spaces
// switches sessions. State lives in memory; we don't persist it.

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

export function getOrCreateSession(spaceId: string): Session {
  let s = sessions.get(spaceId);
  if (!s) {
    s = { spaceId, state: emptySessionState(), sockets: new Set(), emptySince: null };
    sessions.set(spaceId, s);
  }
  s.emptySince = null;
  return s;
}

export function getSession(spaceId: string): Session | undefined {
  return sessions.get(spaceId);
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
export async function propagateUserDisplayName(
  userId: string,
  newDisplayName: string,
  storage: Storage,
): Promise<void> {
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
