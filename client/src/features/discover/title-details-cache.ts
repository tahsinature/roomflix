import type { DiscoverTitleDetails } from "@shared/protocol";
import { api } from "@/lib/api";
import type { TitleSelection } from "./discover-utils";

const CACHE_TTL_MS = 10 * 60 * 1_000;

type CacheEntry = {
  data?: DiscoverTitleDetails;
  promise?: Promise<DiscoverTitleDetails>;
  expiresAt: number;
};

const titleDetailsCache = new Map<string, CacheEntry>();

export function loadTitleDetails(selection: Pick<TitleSelection, "mediaType" | "tmdbId">): Promise<DiscoverTitleDetails> {
  const key = cacheKey(selection);
  const cached = titleDetailsCache.get(key);
  const now = Date.now();

  if (cached?.data && cached.expiresAt > now) return Promise.resolve(cached.data);
  if (cached?.promise) return cached.promise;

  const promise = api
    .discoverTitle(selection.mediaType, selection.tmdbId)
    .then((data) => {
      titleDetailsCache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
      return data;
    })
    .catch((error) => {
      titleDetailsCache.delete(key);
      throw error;
    });

  titleDetailsCache.set(key, { promise, expiresAt: now + CACHE_TTL_MS });
  return promise;
}

export function prefetchTitleDetails(selection: Pick<TitleSelection, "mediaType" | "tmdbId">): void {
  void loadTitleDetails(selection).catch(() => undefined);
}

export function invalidateTitleDetails(selection: Pick<TitleSelection, "mediaType" | "tmdbId">): void {
  titleDetailsCache.delete(cacheKey(selection));
}

function cacheKey(selection: Pick<TitleSelection, "mediaType" | "tmdbId">): string {
  return `${selection.mediaType}:${selection.tmdbId}`;
}
