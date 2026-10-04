import type { DiscoverMediaType, ImdbRatings } from "@shared/protocol";
import { api, UnauthorizedError } from "@/lib/api";
import { loadImdbRatings, missingImdbRatings, primeImdbRatings } from "./imdb-ratings-cache";

const cache = new Map<string, { promise: Promise<ImdbRatings>; expiresAt: number }>();
const queue: Array<() => void> = [];
let active = 0;

function startNext() {
  while (active < 4 && queue.length) queue.shift()!();
}

export function loadCardRatings(mediaType: DiscoverMediaType, tmdbId: number, knownImdbId?: string | null): Promise<ImdbRatings> {
  const key = `${mediaType}:${tmdbId}`;
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.promise;
  const promise = new Promise<ImdbRatings>((resolve) => {
    queue.push(() => {
      active++;
      const request = knownImdbId
        ? loadImdbRatings(knownImdbId)
        : api.cardImdbRatings(mediaType, tmdbId).then(({ imdbId, ratings }) => {
            if (imdbId) primeImdbRatings(imdbId, ratings);
            return ratings;
          });
      void request
        .catch((error) => ({ ...missingImdbRatings, status: error instanceof UnauthorizedError ? ("unauthorized" as const) : ("unavailable" as const) }))
        .then((data) => {
          cache.set(key, { promise: Promise.resolve(data), expiresAt: Date.now() + (data.status === "available" ? 600_000 : 60_000) });
          resolve(data);
        })
        .finally(() => {
          active--;
          startNext();
        });
    });
  });
  if (cache.size >= 2000) cache.delete(cache.keys().next().value!);
  cache.set(key, { promise, expiresAt: Infinity });
  startNext();
  return promise;
}
