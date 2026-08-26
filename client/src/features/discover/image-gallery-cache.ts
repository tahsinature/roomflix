import type { DiscoverImageGallery, DiscoverMediaType } from "@shared/protocol";
import { api } from "@/lib/api";

export type GallerySubject = { type: DiscoverMediaType; tmdbId: number } | { type: "person"; tmdbId: number };

type CacheEntry = {
  data?: DiscoverImageGallery;
  promise?: Promise<DiscoverImageGallery>;
};

const cache = new Map<string, CacheEntry>();

function subjectKey(subject: GallerySubject): string {
  return `${subject.type}:${subject.tmdbId}`;
}

export function loadImageGallery(subject: GallerySubject): Promise<DiscoverImageGallery> {
  const key = subjectKey(subject);
  const cached = cache.get(key);
  if (cached?.data) return Promise.resolve(cached.data);
  if (cached?.promise) return cached.promise;

  const request = subject.type === "person" ? api.discoverPersonImages(subject.tmdbId) : api.discoverTitleImages(subject.type, subject.tmdbId);
  const entry: CacheEntry = {};
  entry.promise = request
    .then((data) => {
      entry.data = data;
      entry.promise = undefined;
      return data;
    })
    .catch((error) => {
      cache.delete(key);
      throw error;
    });
  cache.set(key, entry);
  return entry.promise;
}

export function prefetchImageGallery(subject: GallerySubject): void {
  void loadImageGallery(subject).catch(() => undefined);
}

export function invalidateImageGallery(subject: GallerySubject): void {
  cache.delete(subjectKey(subject));
}
