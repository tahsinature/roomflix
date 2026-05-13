import type { Subtitle, Video } from "@/protocol.ts";
import type { VideoRepo } from "@/storage/types.ts";

function randomId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export class InMemoryVideoRepo implements VideoRepo {
  private byId = new Map<string, Video>();

  async list(): Promise<Video[]> {
    return [...this.byId.values()].sort((a, b) => b.addedAt - a.addedAt);
  }

  async get(id: string): Promise<Video | null> {
    return this.byId.get(id) ?? null;
  }

  async findByUrl(url: string): Promise<Video | null> {
    const target = url.trim();
    for (const v of this.byId.values()) {
      if (v.url === target) return v;
    }
    return null;
  }

  async create(input: { url: string; title?: string; subtitles?: Subtitle[] }): Promise<Video> {
    const url = input.url.trim();
    const existing = await this.findByUrl(url);
    if (existing) return existing;

    const now = Date.now();
    const video: Video = {
      id: randomId(),
      url,
      title: input.title?.trim() || defaultTitleFromUrl(url),
      subtitles: input.subtitles ? input.subtitles.map(normalizeSubtitle) : [],
      addedAt: now,
      updatedAt: now,
    };
    this.byId.set(video.id, video);
    return video;
  }

  async update(id: string, patch: { url?: string; title?: string; subtitles?: Subtitle[] }): Promise<Video | null> {
    const existing = this.byId.get(id);
    if (!existing) return null;
    const nextUrl = patch.url !== undefined ? patch.url.trim() : existing.url;
    // Title falls back to the current title or a filename derived from the
    // (possibly new) URL — keeps the display sane when only the URL changed.
    const nextTitle =
      patch.title !== undefined
        ? patch.title.trim() || defaultTitleFromUrl(nextUrl)
        : existing.title === existing.url || existing.title === defaultTitleFromUrl(existing.url)
          ? defaultTitleFromUrl(nextUrl)
          : existing.title;
    const updated: Video = {
      ...existing,
      url: nextUrl,
      title: nextTitle,
      ...(patch.subtitles !== undefined ? { subtitles: patch.subtitles.map(normalizeSubtitle) } : {}),
      updatedAt: Date.now(),
    };
    this.byId.set(id, updated);
    return updated;
  }

  async remove(id: string): Promise<boolean> {
    return this.byId.delete(id);
  }
}

// Default display title when the caller didn't provide one — last path
// segment of the URL, percent-decoded. Falls back to the full URL when
// parsing fails (typically: scheme-less or otherwise malformed input).
function defaultTitleFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const last = u.pathname.split("/").filter(Boolean).pop();
    if (!last) return u.hostname || url;
    try {
      return decodeURIComponent(last);
    } catch {
      return last;
    }
  } catch {
    return url;
  }
}

// Trim text fields, mint an id when missing. Caller-supplied ids are kept so
// the UI can preserve identity across edits.
function normalizeSubtitle(s: Subtitle): Subtitle {
  return {
    id: s.id?.trim() || randomId(),
    url: s.url.trim(),
    label: s.label?.trim() || s.url.trim(),
    lang: s.lang?.trim() ?? "",
  };
}
