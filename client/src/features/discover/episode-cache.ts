import type { DiscoverEpisodeDetails, DiscoverSeasonDetails } from "@shared/protocol";
import { api } from "@/lib/api";
import type { EpisodeSelection } from "./discover-utils";

const CACHE_TTL_MS = 10 * 60 * 1_000;

type CacheEntry<T> = {
  data?: T;
  promise?: Promise<T>;
  expiresAt: number;
};

const seasonCache = new Map<string, CacheEntry<DiscoverSeasonDetails>>();
const episodeCache = new Map<string, CacheEntry<DiscoverEpisodeDetails>>();

export function loadSeasonDetails(seriesTmdbId: number, seasonNumber: number): Promise<DiscoverSeasonDetails> {
  const key = `${seriesTmdbId}:${seasonNumber}`;
  return loadCached(seasonCache, key, () => api.discoverSeason(seriesTmdbId, seasonNumber));
}

export function loadEpisodeDetails(selection: EpisodeSelection): Promise<DiscoverEpisodeDetails> {
  const key = episodeKey(selection);
  return loadCached(episodeCache, key, () => api.discoverEpisode(selection.seriesTmdbId, selection.seasonNumber, selection.episodeNumber));
}

export function prefetchEpisodeDetails(selection: EpisodeSelection): void {
  void loadEpisodeDetails(selection).catch(() => undefined);
}

export function invalidateEpisodeDetails(selection: EpisodeSelection): void {
  episodeCache.delete(episodeKey(selection));
}

function loadCached<T>(cache: Map<string, CacheEntry<T>>, key: string, request: () => Promise<T>): Promise<T> {
  const cached = cache.get(key);
  const now = Date.now();

  if (cached?.data && cached.expiresAt > now) return Promise.resolve(cached.data);
  if (cached?.promise) return cached.promise;

  const promise = request()
    .then((data) => {
      cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
      return data;
    })
    .catch((error) => {
      cache.delete(key);
      throw error;
    });

  cache.set(key, { promise, expiresAt: now + CACHE_TTL_MS });
  return promise;
}

function episodeKey(selection: EpisodeSelection): string {
  return `${selection.seriesTmdbId}:${selection.seasonNumber}:${selection.episodeNumber}`;
}
