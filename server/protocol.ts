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
