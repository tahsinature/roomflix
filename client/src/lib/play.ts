import type { RoomListItem } from "@shared/protocol";
import { randomRoomId } from "@/lib/utils";

// Find rooms currently playing the given URL, most-recently-active first.
// Returns [] when no rooms match. Callers handle the multi-match case
// (typically by surfacing a picker so the user can choose).
export function findActiveRoomsFor(url: string, rooms: RoomListItem[]): RoomListItem[] {
  return rooms.filter((r) => r.video?.url === url).sort((a, b) => b.updatedAt - a.updatedAt);
}

// Path for a brand-new room pre-loaded with the given URL. Room.tsx reads
// the ?video= param on mount and calls setUrl once.
export function pathForNewRoomPlaying(url: string): string {
  return `/room/${randomRoomId()}?video=${encodeURIComponent(url)}`;
}

// Whitelist of extensions any browser might handle (some only work in
// specific browsers — that's the player's problem to surface). Covers both
// video and audio containers since rooms can hold either. URLs without any
// extension are treated as unknown and not blocked.
const MEDIA_EXTS = new Set([
  // Video
  "mp4", "webm", "mkv", "mov", "m4v", "ogv", "ogg", "avi", "3gp", "mpeg", "mpg",
  // Audio
  "mp3", "m4a", "aac", "flac", "wav", "opus", "oga", "weba",
]);

// Returns true when the URL has an extension that's *clearly not* a playable
// media file (e.g. .bin, .pdf, .zip). Used to gate Play upfront so the user
// doesn't dispatch into a room only to hit the player error overlay.
//   • known media extension → false (don't block)
//   • known non-media extension → true (block)
//   • no extension at all → false (don't block; we have no signal)
export function urlIsClearlyNotMedia(url: string): boolean {
  const path = url.split("?")[0]!.split("#")[0]!;
  // Only treat the last segment as having an extension; ignore "." in path.
  const lastSeg = path.split("/").pop() ?? "";
  if (!lastSeg.includes(".")) return false;
  const ext = lastSeg.split(".").pop()?.toLowerCase();
  if (!ext) return false;
  return !MEDIA_EXTS.has(ext);
}
