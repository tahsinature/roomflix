import type { DiscoverPersonDetails } from "@shared/protocol";
import { api } from "@/lib/api";

const CACHE_TTL_MS = 10 * 60 * 1_000;

type CacheEntry = {
  data?: DiscoverPersonDetails;
  promise?: Promise<DiscoverPersonDetails>;
  expiresAt: number;
};

const personDetailsCache = new Map<number, CacheEntry>();

export function loadPersonDetails(tmdbId: number): Promise<DiscoverPersonDetails> {
  const cached = personDetailsCache.get(tmdbId);
  const now = Date.now();

  if (cached?.data && cached.expiresAt > now) return Promise.resolve(cached.data);
  if (cached?.promise) return cached.promise;

  const promise = api
    .discoverPerson(tmdbId)
    .then((data) => {
      personDetailsCache.set(tmdbId, { data, expiresAt: Date.now() + CACHE_TTL_MS });
      return data;
    })
    .catch((error) => {
      personDetailsCache.delete(tmdbId);
      throw error;
    });

  personDetailsCache.set(tmdbId, { promise, expiresAt: now + CACHE_TTL_MS });
  return promise;
}

export function prefetchPersonDetails(tmdbId: number): void {
  void loadPersonDetails(tmdbId).catch(() => undefined);
}

export function invalidatePersonDetails(tmdbId: number): void {
  personDetailsCache.delete(tmdbId);
}
