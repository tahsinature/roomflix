import type { ImdbRatings } from "@shared/protocol";
import { api, UnauthorizedError } from "@/lib/api";

const cache = new Map<string, { promise: Promise<ImdbRatings>; expiresAt: number }>();
export const missingImdbRatings: ImdbRatings = { rating: null, votes: null, status: "not_found", fetchedAt: null };

export function loadImdbRatings(imdbId: string | null): Promise<ImdbRatings> {
  if (!imdbId) return Promise.resolve(missingImdbRatings);
  const cached = cache.get(imdbId);
  if (cached && cached.expiresAt > Date.now()) return cached.promise;
  const promise = api
    .imdbRatings(imdbId)
    .then((data) => {
      cache.set(imdbId, { promise: Promise.resolve(data), expiresAt: Date.now() + (data.status === "available" ? 10 * 60 * 1000 : 60 * 1000) });
      return data;
    })
    .catch((error: unknown) => {
      const data: ImdbRatings = { ...missingImdbRatings, status: error instanceof UnauthorizedError ? "unauthorized" : "unavailable" };
      cache.set(imdbId, { promise: Promise.resolve(data), expiresAt: Date.now() + 60 * 1000 });
      return data;
    });
  cache.set(imdbId, { promise, expiresAt: Infinity });
  return promise;
}
