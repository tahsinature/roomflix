// Path for the watch surface, optionally pre-loading a URL. The Watch
// page reads ?video= on mount and dispatches setUrl once.
export function pathForWatchWithUrl(url: string): string {
  return `/watch?video=${encodeURIComponent(url)}`;
}

// Whitelist of extensions any browser might handle (some only work in
// specific browsers — that's the player's problem to surface). Covers both
// video and audio containers. URLs without any extension are treated as
// unknown and not blocked.
const MEDIA_EXTS = new Set([
  // Video
  "mp4", "webm", "mkv", "mov", "m4v", "ogv", "ogg", "avi", "3gp", "mpeg", "mpg",
  // Audio
  "mp3", "m4a", "aac", "flac", "wav", "opus", "oga", "weba",
]);

// Returns true when the URL has an extension that's *clearly not* a playable
// media file (e.g. .bin, .pdf, .zip). Used to gate Play upfront so the user
// doesn't dispatch into a watch session only to hit the player error overlay.
//   • known media extension → false (don't block)
//   • known non-media extension → true (block)
//   • no extension at all → false (don't block; we have no signal)
export function urlIsClearlyNotMedia(url: string): boolean {
  const path = url.split("?")[0]!.split("#")[0]!;
  const lastSeg = path.split("/").pop() ?? "";
  if (!lastSeg.includes(".")) return false;
  const ext = lastSeg.split(".").pop()?.toLowerCase();
  if (!ext) return false;
  return !MEDIA_EXTS.has(ext);
}
