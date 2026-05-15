import type { Subtitle, Video } from "@/protocol.ts";
import type { Session, SessionRepo, StoredUser, UserRepo, VideoRepo } from "@/storage/types.ts";

function randomId(): string {
  return Math.random().toString(36).slice(2, 10);
}

// In-memory VideoRepo. Production uses MongoVideoRepo; this stays around for
// fast unit tests that don't need a real DB.
export class InMemoryVideoRepo implements VideoRepo {
  private byId = new Map<string, Video>();

  async list(spaceId: string): Promise<Video[]> {
    return [...this.byId.values()].filter((v) => v.spaceId === spaceId).sort((a, b) => b.addedAt - a.addedAt);
  }

  async get(spaceId: string, id: string): Promise<Video | null> {
    const v = this.byId.get(id);
    return v && v.spaceId === spaceId ? v : null;
  }

  async findByUrl(spaceId: string, url: string): Promise<Video | null> {
    const target = url.trim();
    for (const v of this.byId.values()) {
      if (v.spaceId === spaceId && v.url === target) return v;
    }
    return null;
  }

  async create(input: { spaceId: string; addedBy: string; url: string; title?: string; subtitles?: Subtitle[] }): Promise<Video> {
    const url = input.url.trim();
    const existing = await this.findByUrl(input.spaceId, url);
    if (existing) return existing;

    const now = Date.now();
    const video: Video = {
      id: randomId(),
      spaceId: input.spaceId,
      addedBy: input.addedBy,
      url,
      title: input.title?.trim() || defaultTitleFromUrl(url),
      subtitles: input.subtitles ? input.subtitles.map(normalizeSubtitle) : [],
      addedAt: now,
      updatedAt: now,
    };
    this.byId.set(video.id, video);
    return video;
  }

  async update(spaceId: string, id: string, patch: { url?: string; title?: string; subtitles?: Subtitle[] }): Promise<Video | null> {
    const existing = this.byId.get(id);
    if (!existing || existing.spaceId !== spaceId) return null;
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

  async remove(spaceId: string, id: string): Promise<boolean> {
    const existing = this.byId.get(id);
    if (!existing || existing.spaceId !== spaceId) return false;
    return this.byId.delete(id);
  }

  async reparent(): Promise<number> {
    // No legacy data in the in-memory impl — migration is a no-op here.
    return 0;
  }
}

export class InMemoryUserRepo implements UserRepo {
  private byId = new Map<string, StoredUser>();
  private byUsername = new Map<string, string>();

  async findByUsername(username: string): Promise<StoredUser | null> {
    const id = this.byUsername.get(username.toLowerCase());
    return id ? (this.byId.get(id) ?? null) : null;
  }

  async findById(id: string): Promise<StoredUser | null> {
    return this.byId.get(id) ?? null;
  }

  async create(input: { username: string; passwordHash: string; isAdmin: boolean }): Promise<StoredUser> {
    const user: StoredUser = {
      id: randomId(),
      username: input.username,
      displayName: null,
      passwordHash: input.passwordHash,
      isAdmin: input.isAdmin,
      createdAt: Date.now(),
    };
    this.byId.set(user.id, user);
    this.byUsername.set(user.username.toLowerCase(), user.id);
    return user;
  }

  async count(): Promise<number> {
    return this.byId.size;
  }

  async listAll(): Promise<StoredUser[]> {
    return [...this.byId.values()];
  }

  async updateProfile(id: string, patch: { displayName?: string | null }): Promise<StoredUser | null> {
    const u = this.byId.get(id);
    if (!u) return null;
    if (patch.displayName !== undefined) u.displayName = patch.displayName;
    return u;
  }
}

export class InMemorySessionRepo implements SessionRepo {
  private byToken = new Map<string, Session>();

  async create(input: { token: string; userId: string | null; currentSpaceId: string | null; guestDisplayName: string | null; expiresAt: number }): Promise<Session> {
    const session: Session = {
      token: input.token,
      userId: input.userId,
      currentSpaceId: input.currentSpaceId,
      guestDisplayName: input.guestDisplayName,
      createdAt: Date.now(),
      expiresAt: input.expiresAt,
    };
    this.byToken.set(input.token, session);
    return session;
  }

  async findByToken(token: string): Promise<Session | null> {
    const s = this.byToken.get(token);
    if (!s) return null;
    if (s.expiresAt < Date.now()) {
      this.byToken.delete(token);
      return null;
    }
    return s;
  }

  async setCurrentSpace(token: string, spaceId: string | null): Promise<void> {
    const s = this.byToken.get(token);
    if (!s) return;
    s.currentSpaceId = spaceId;
  }

  async setGuestDisplayName(token: string, displayName: string): Promise<void> {
    const s = this.byToken.get(token);
    if (!s) return;
    s.guestDisplayName = displayName;
  }

  async deleteByToken(token: string): Promise<boolean> {
    return this.byToken.delete(token);
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
