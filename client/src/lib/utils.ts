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
