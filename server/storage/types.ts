// Storage abstraction. The rest of the server depends only on these
// interfaces, so swapping the in-memory impl for a DB-backed one (Postgres,
// SQLite, etc.) is a matter of writing a new implementation and pointing the
// factory in ./index.ts at it — no changes elsewhere.
import type { Subtitle, Video } from "../protocol.ts";

export interface VideoRepo {
  list(): Promise<Video[]>;
  get(id: string): Promise<Video | null>;
  findByUrl(url: string): Promise<Video | null>;
  // Idempotent on url: returns the existing video if one with the same url
  // already exists. A SQL impl would back this with a UNIQUE(url) constraint
  // and ON CONFLICT DO NOTHING semantics.
  create(input: {
    url: string;
    title?: string;
    subtitles?: Subtitle[];
  }): Promise<Video>;
  update(
    id: string,
    patch: { title?: string; subtitles?: Subtitle[] },
  ): Promise<Video | null>;
  remove(id: string): Promise<boolean>;
}

// Stores the raw text of uploaded subtitle files. Keeps content out of
// VideoRepo (which holds metadata) so the eventual DB swap can use object
// storage (S3/R2) for files independently of relational rows.
export interface SubtitleFileRepo {
  put(input: {
    content: string;
    contentType: string;
  }): Promise<{ id: string; url: string }>;
  get(id: string): Promise<{ content: string; contentType: string } | null>;
}

export type Storage = {
  videos: VideoRepo;
  subtitleFiles: SubtitleFileRepo;
};
