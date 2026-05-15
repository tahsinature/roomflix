// Shared types between client and server. The client imports this file
// directly from ../server/protocol.ts via its tsconfig path alias.

export type Subtitle = {
  id: string;
  url: string;
  label: string;
  lang: string;
};

export type Video = {
  id: string;
  spaceId: string;
  // Who added this entry. Useful when the same space has multiple members
  // contributing — the UI surfaces "added by @sam" and edit/delete rights
  // fall back to creator + space owner.
  addedBy: string;
  url: string;
  title: string;
  subtitles: Subtitle[];
  addedAt: number; // server epoch ms
  updatedAt: number;
};

// Wire shape for the current user. The password hash is never serialized.
// displayName is the friendly label other people see — falls back to
// `@username` everywhere when null.
export type AuthUser = {
  id: string;
  username: string;
  displayName: string | null;
  isAdmin: boolean;
  createdAt: number;
};

// A space groups members + their shared library, playlists, imports, and
// storage backend. Every user has at least one — the auto-created "Home"
// space. Membership is tracked separately so a user can be in many spaces
// and roles are easy to evolve.
export type Space = {
  id: string;
  name: string;
  ownerId: string;
  createdAt: number;
  updatedAt: number;
};

export type SpaceRole = "owner" | "member";

export type SpaceMember = {
  spaceId: string;
  userId: string;
  username: string; // denormalized for member lists
  displayName: string | null; // denormalized too; null = render as @username
  role: SpaceRole;
  joinedAt: number;
};

// Invite codes are short, human-shareable, and bound to one space.
//   kind: "member" — recipient must register / sign in and joins as a
//                    persistent space member.
//   kind: "guest"  — recipient picks a display name on the fly and joins
//                    as a guest session. No account. Full member powers
//                    inside the space; cannot manage spaces.
//   usesRemaining: caps redemption count (null = unlimited)
//   expiresAt: absolute epoch ms past which redemption is rejected (null
//              = never expires)
export type InviteKind = "member" | "guest";

export type InviteCode = {
  code: string;
  spaceId: string;
  createdBy: string;
  kind: InviteKind;
  usesRemaining: number | null;
  expiresAt: number | null;
  createdAt: number;
};

// Guest identity returned by /api/auth/session for guest cookies. The id
// is the opaque session token — used as a stable per-session attribution
// handle for addedBy / createdBy fields on writes.
export type GuestIdentity = {
  id: string;
  displayName: string;
  spaceId: string;
};

// TV-pairing flow. Guest starts a pairing, gets an 8-digit code, reads it
// to an admin who's already in a space. Admin types the code to admit the
// guest. The pending record carries the chosen display name so it's set
// the moment the session activates.
export type PairingStatus = "pending" | "approved";

export type PairingCode = {
  code: string;
  displayName: string;
  status: PairingStatus;
  // Filled in once an admin approves.
  spaceId: string | null;
  spaceName: string | null;
  // Session token minted at approval time. The guest's status poll picks
  // it up via Set-Cookie — the token never leaves the server in JSON.
  sessionToken: string | null;
  createdAt: number;
  expiresAt: number;
};

// Connected viewer identity, surfaced in WS broadcasts and the /state
// snapshot so the UI can render "who's watching" instead of just a count.
// `id` is deduped per-identity (real user id for users, guest session
// token for guests) — multiple tabs from the same person count once.
//
// A Viewer is specifically someone with status "watching" (they're on
// /watch). For the broader "who's in this space at all" use Participant.
export type Viewer = {
  id: string;
  kind: "user" | "guest";
  displayName: string;
};

// Per-identity presence in a space. Same dedupe rules as Viewer; the
// `status` field is the highest-engaged status across all of that
// identity's tabs (one watching tab + one dashboard tab → "watching").
//   offline  — not in this list at all; the client derives it by
//              checking membership against the presence list
//   online   — connected somewhere in the app, but not on /watch
//   watching — actively on /watch
export type PresenceStatus = "online" | "watching";

// Per-tab audio settings. Always per-device — we never apply someone
// else's volume to your own player. Surfaced so other viewers can tell
// "alice is muted, that's why she's not laughing", not for control.
export type Volume = {
  // 0..1 inclusive. Matches HTMLMediaElement.volume.
  level: number;
  muted: boolean;
};

export type Participant = {
  id: string;
  kind: "user" | "guest";
  displayName: string;
  status: PresenceStatus;
  // Only set for status === "watching" — others aren't running a player.
  // Most-recent-updated tab wins when one identity has multiple watching
  // tabs (matches user intent on the device they last touched).
  volume?: Volume;
};

// Lightweight snapshot of the in-memory playback session for a space.
// Returned by GET /api/session/state and used to render the "currently
// playing" banner without opening a full WS connection (which would count
// as a viewer and pollute the count).
export type SessionStateSnapshot = {
  videoUrl: string | null;
  videoTitle: string | null;
  playing: boolean;
  viewers: Viewer[];
  playlistId: string | null;
};

// Lightweight "what space am I in right now" hint shipped with /api/auth/session.
export type SpaceSummary = {
  id: string;
  name: string;
  role: SpaceRole;
};

// Per-user storage config (Cloudflare R2 for now). secretAccessKey is
// encrypted at rest server-side; the wire shape carries the cleartext
// because the browser also needs it to do client-side file management.
export type StorageConfig = {
  provider: "r2";
  accountId: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl?: string;
  maxBytes: number;
  label?: string;
  updatedAt: number;
};

// "ok"          → URL responded 2xx/3xx within timeout
// "gone"        → URL responded 4xx/5xx, timed out, or network error
// "unverified"  → host disallows HEAD (e.g. 405) — couldn't determine
export type HealthStatus = "ok" | "gone" | "unverified";

// Per-video health snapshot. The map is keyed by Subtitle.id.
export type VideoHealth = {
  video: HealthStatus;
  subtitles: Record<string, HealthStatus>;
};

export type LibraryHealth = {
  checkedAt: number;
  videos: Record<string, VideoHealth>;
};

// Verdict for a one-shot URL probe used by the library Add form.
//   "ok"        — reachable AND looks like a video (content-type starts with
//                  "video/" or URL has a known video extension).
//   "uncertain" — reachable but content-type is unclear, or HEAD blocked but
//                  URL has a video extension. User can override.
//   "gone"      — 4xx/5xx/network error/timeout.
export type ProbeVerdict = "ok" | "uncertain" | "gone";

export type ProbeResult = {
  verdict: ProbeVerdict;
  contentType?: string;
  contentLength?: number;
  message?: string;
};

// Synced session state — shared across everyone in the same space.
// Audio settings (volume, muted) are intentionally NOT here — they're
// per-device, like every other watch-together product. One viewer muting
// their phone shouldn't mute everyone else.
export type SessionState = {
  videoUrl: string | null;
  // Resolved library title for videoUrl. Server fills this on setUrl from
  // the library entry. Null when there's no URL loaded.
  videoTitle: string | null;
  // Snapshot of the library entry's subtitles at the time of the last setUrl.
  // Empty if the URL has no library entry. Selection (which one to show) is
  // per-viewer, not in here.
  subtitles: Subtitle[];
  playing: boolean;
  // currentTime is the playback position at `updatedAt`.
  // If playing, effective time is currentTime + (now - updatedAt) / 1000.
  currentTime: number;
  // Playlist context. Null `playlistId` means the room is on a standalone
  // URL (the videoUrl above) — playlistIndex is meaningless in that case
  // but kept at 0 for serialization simplicity.
  playlistId: string | null;
  playlistIndex: number;
  playlistLoop: boolean;
  updatedAt: number; // server epoch ms
  updatedBy: string | null; // clientId
};

// Ordered playlist of library video IDs, owned by a space. Hydration to
// full Video records happens at the API boundary (see PlaylistDetail).
export type Playlist = {
  id: string;
  spaceId: string;
  // Member who created this playlist. Edit/delete is allowed for the
  // creator and for the space owner — anyone else is read-only.
  createdBy: string;
  title: string;
  videoIds: string[];
  createdAt: number;
  updatedAt: number;
};

// API GET /api/playlists/:id shape. The full Video record is inlined for
// each playlist entry so the client doesn't N+1 the library on render.
// Missing entries (deleted from library since being added) show up as
// `null` so the UI can render a "removed" placeholder without losing the
// position. The original videoIds list is preserved for round-tripping.
export type PlaylistDetail = Playlist & {
  videos: Array<Video | null>;
};

// Messages sent by the client to the server.
//
// Playlist messages:
//   loadPlaylist     — switch the room onto a playlist; server seeds
//                      videoUrl from index 0 (or null for empty playlists).
//   playlistNext /
//     playlistPrev   — manual nav. Server clamps at the ends unless loop=on,
//                      in which case it wraps.
//   playlistJumpTo   — set a specific index (e.g. clicking a queue item).
//   videoEnded       — fired by the client when `<video>` finishes. The
//                      `endedUrl` field lets the server ignore stale signals
//                      (e.g. a client that just rejoined and missed a prior
//                      advance).
//   setPlaylistLoop  — toggle wrap-at-end behavior.
export type ClientMessage =
  | { type: "hello"; clientId: string }
  | { type: "play"; currentTime: number }
  | { type: "pause"; currentTime: number }
  | { type: "seek"; currentTime: number }
  | { type: "setUrl"; videoUrl: string }
  | { type: "loadPlaylist"; playlistId: string }
  | { type: "playlistNext" }
  | { type: "playlistPrev" }
  | { type: "playlistJumpTo"; index: number }
  | { type: "videoEnded"; endedUrl: string }
  | { type: "setPlaylistLoop"; loop: boolean }
  // Sent when the client transitions in/out of /watch within the SPA.
  // Server updates ws.data.status and rebroadcasts presence + viewers.
  | { type: "setStatus"; status: PresenceStatus }
  // Sent from the Watch page when the player's volume or muted state
  // changes. Server updates ws.data.volume + rebroadcasts presence so
  // other clients can show "alice is muted" etc. Client should debounce
  // to avoid flooding during slider drags.
  | { type: "setVolume"; level: number; muted: boolean };

// Messages sent by the server to clients.
export type ServerMessage =
  | { type: "state"; state: SessionState; viewers: Viewer[]; serverTime: number }
  | { type: "viewers"; viewers: Viewer[] }
  // Full presence list — everyone connected to this space, with status.
  // Sent on join, leave, and status change. Clients should treat this
  // as the source of truth and replace their local participant list.
  | { type: "presence"; participants: Participant[] }
  // Persistent membership delta. Sent when a member's denormalized
  // fields change (e.g. they edited their display name). Clients patch
  // their REST-cached members list by userId — the row's other fields
  // remain valid since it's the same membership record.
  | { type: "memberUpdated"; member: SpaceMember };

export function emptySessionState(): SessionState {
  return {
    videoUrl: null,
    videoTitle: null,
    subtitles: [],
    playing: false,
    currentTime: 0,
    playlistId: null,
    playlistIndex: 0,
    playlistLoop: false,
    updatedAt: Date.now(),
    updatedBy: null,
  };
}
