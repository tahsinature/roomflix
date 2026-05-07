import type { Subtitle, Video } from "../protocol.ts";
import type { SubtitleFileRepo, VideoRepo } from "./types.ts";

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

  async create(input: {
    url: string;
    title?: string;
    subtitles?: Subtitle[];
  }): Promise<Video> {
    const url = input.url.trim();
    const existing = await this.findByUrl(url);
    if (existing) return existing;

    const now = Date.now();
    const video: Video = {
      id: randomId(),
      url,
      title: input.title?.trim() || url,
      subtitles: input.subtitles ? input.subtitles.map(normalizeSubtitle) : [],
      addedAt: now,
      updatedAt: now,
    };
    this.byId.set(video.id, video);
    return video;
  }

  async update(
    id: string,
    patch: { title?: string; subtitles?: Subtitle[] },
  ): Promise<Video | null> {
    const existing = this.byId.get(id);
    if (!existing) return null;
    const updated: Video = {
      ...existing,
      ...(patch.title !== undefined
        ? { title: patch.title.trim() || existing.url }
        : {}),
      ...(patch.subtitles !== undefined
        ? { subtitles: patch.subtitles.map(normalizeSubtitle) }
        : {}),
      updatedAt: Date.now(),
    };
    this.byId.set(id, updated);
    return updated;
  }

  async remove(id: string): Promise<boolean> {
    return this.byId.delete(id);
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

export class InMemorySubtitleFileRepo implements SubtitleFileRepo {
  private files = new Map<string, { content: string; contentType: string }>();

  async put(input: { content: string; contentType: string }) {
    const id = randomId();
    this.files.set(id, input);
    return { id, url: `/api/subtitles/${id}` };
  }

  async get(id: string) {
    return this.files.get(id) ?? null;
  }
}
