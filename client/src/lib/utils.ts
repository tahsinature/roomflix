import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function randomRoomId(): string {
  // Short, friendly, unambiguous alphabet (no 0/O/1/I/l).
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 6; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

export function randomClientId(): string {
  return Math.random().toString(36).slice(2, 10);
}

// Round-trip a URL through `new URL()` to get a stable canonical form —
// percent-encodes spaces, normalizes default ports, lowercases the host,
// etc. Tolerant of scheme-less inputs (assumes `https://`) so a bare
// `cdn.example.com/foo` matches a fully-qualified `https://cdn.example.com/foo`
// when both pass through this function. Used as a comparison key wherever
// two URLs need to match regardless of how they were originally typed.
export function canonicalUrl(url: string): string {
  const withProto = /^[a-z][a-z0-9+\-.]*:\/\//i.test(url) ? url : `https://${url}`;
  try {
    return new URL(withProto).toString();
  } catch {
    return url;
  }
}

// Extension-based media classification. Returns "audio" for the common audio
// containers, "video" for everything else (including unknown). The kind drives
// which player we render — same room state, same sync protocol underneath.
const AUDIO_EXTENSIONS = new Set(["mp3", "m4a", "aac", "flac", "wav", "opus", "oga", "weba"]);

export function mediaKind(url: string | null | undefined): "audio" | "video" {
  if (!url) return "video";
  const ext = url.split("?")[0].split("#")[0].split(".").pop()?.toLowerCase();
  return ext && AUDIO_EXTENSIONS.has(ext) ? "audio" : "video";
}

// mm:ss for tracks under an hour, hh:mm:ss otherwise. Used by the audio
// player's scrubber readout.
export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00";
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

// Human-readable byte counts: 950 MB, 1.23 GB, etc. Picks the largest unit
// that keeps the number > 1 and trims decimals once the unit is small enough
// to read at a glance.
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v < 10 && i > 0 ? v.toFixed(2) : v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

// Compact display name for a URL: the last path segment, decoded. Falls
// back to host when there's no path. Used in lists where the full URL
// would dominate the row — pair with a `title={url}` tooltip so the full
// URL is still one hover away.
export function urlFilename(url: string): string {
  try {
    const u = new URL(url);
    const last = u.pathname.split("/").filter(Boolean).pop();
    if (!last) return u.hostname;
    try {
      return decodeURIComponent(last);
    } catch {
      return last;
    }
  } catch {
    return url;
  }
}
