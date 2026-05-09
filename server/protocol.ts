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
  url: string;
  title: string;
  subtitles: Subtitle[];
  addedAt: number; // server epoch ms
  updatedAt: number;
};

// A live room as exposed via GET /api/rooms. The video object resolves the
// current videoUrl to a library entry's title when one exists, falling back
// to the URL itself.
export type RoomListItem = {
  id: string;
  viewers: number;
  video: { url: string; title: string } | null;
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

// Wire format for the JSON export/import. Internal ids and timestamps are
// intentionally absent — they're server-assigned and would just be noise
// when re-importing into a different server instance.
export type LibraryExportV1 = {
  version: 1;
  exportedAt: number;
  videos: Array<{
    url: string;
    title: string;
    subtitles: Array<{ url: string; label: string; lang: string }>;
  }>;
};

export type LibraryImportResult = {
  imported: number; // new entries created
  updated: number; // existing entries patched (title/subtitles changed)
  skipped: number; // existing entries with identical content
  errors: Array<{ url: string; reason: string }>;
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

export type RoomState = {
  videoUrl: string | null;
  // Snapshot of the library entry's subtitles at the time of the last setUrl.
  // Empty if the URL has no library entry. Selection (which one to show) is
  // per-viewer, not in here.
  subtitles: Subtitle[];
  playing: boolean;
  // currentTime is the playback position at `updatedAt`.
  // If playing, effective time is currentTime + (now - updatedAt) / 1000.
  currentTime: number;
  muted: boolean;
  updatedAt: number; // server epoch ms
  updatedBy: string | null; // clientId
};

// Messages sent by the client to the server.
export type ClientMessage =
  | { type: "hello"; clientId: string }
  | { type: "play"; currentTime: number }
  | { type: "pause"; currentTime: number }
  | { type: "seek"; currentTime: number }
  | { type: "setMuted"; muted: boolean }
  | { type: "setUrl"; videoUrl: string };

// Messages sent by the server to clients.
export type ServerMessage =
  | { type: "state"; state: RoomState; viewers: number; serverTime: number }
  | { type: "viewers"; viewers: number };

export function emptyRoomState(): RoomState {
  return {
    videoUrl: null,
    subtitles: [],
    playing: false,
    currentTime: 0,
    muted: false,
    updatedAt: Date.now(),
    updatedBy: null,
  };
}
