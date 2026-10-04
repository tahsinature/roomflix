import type { DiscoverSeriesStatus, DiscoverTitleDetails } from "@shared/protocol";
import { api } from "@/lib/api";

const CACHE_TTL_MS = 10 * 60 * 1_000;
const cache = new Map<number, { expiresAt: number; promise: Promise<DiscoverSeriesStatus> }>();
const queue: Array<() => void> = [];
let activeRequests = 0;

function startNext() {
  while (activeRequests < 4 && queue.length) queue.shift()!();
}

export function primeSeriesStatus(details: DiscoverTitleDetails) {
  if (details.mediaType !== "tv") return;
  cache.set(details.tmdbId, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    promise: Promise.resolve({
      status: details.status,
      nextEpisode: details.nextEpisode,
      firstAirDate: details.releaseDate,
      lastAirDate: details.lastAirDate,
      numberOfSeasons: details.numberOfSeasons,
      numberOfEpisodes: details.numberOfEpisodes,
    }),
  });
}

export function loadSeriesStatus(tmdbId: number): Promise<DiscoverSeriesStatus> {
  const existing = cache.get(tmdbId);
  if (existing && existing.expiresAt > Date.now()) return existing.promise;
  const promise = new Promise<DiscoverSeriesStatus>((resolve) => {
    queue.push(() => {
      activeRequests++;
      void api
        .discoverSeriesStatus(tmdbId)
        .then(resolve)
        .catch(() => {
          cache.delete(tmdbId);
          resolve({ status: "", nextEpisode: null });
        })
        .finally(() => {
          activeRequests--;
          startNext();
        });
    });
  });
  if (cache.size >= 500) cache.delete(cache.keys().next().value!);
  cache.set(tmdbId, { expiresAt: Date.now() + CACHE_TTL_MS, promise });
  startNext();
  return promise;
}
