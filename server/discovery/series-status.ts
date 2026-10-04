import type { DiscoverSeriesStatus } from "@/protocol.ts";
import { tmdbRequest } from "./tmdb-client.ts";
import type { RawTitleDetails } from "./tmdb-types.ts";

export function toSeriesStatus(
  item: Pick<RawTitleDetails, "status" | "next_episode_to_air" | "first_air_date" | "last_air_date" | "number_of_seasons" | "number_of_episodes">,
): DiscoverSeriesStatus {
  const episode = item.next_episode_to_air;
  const seasonNumber = episode?.season_number;
  const episodeNumber = episode?.episode_number;
  const nextEpisode =
    typeof seasonNumber === "number" &&
    Number.isSafeInteger(seasonNumber) &&
    seasonNumber > 0 &&
    typeof episodeNumber === "number" &&
    Number.isSafeInteger(episodeNumber) &&
    episodeNumber > 0
      ? { seasonNumber, episodeNumber, airDate: episode?.air_date ?? "" }
      : null;
  return {
    numberOfSeasons: item.number_of_seasons ?? null,
    numberOfEpisodes: item.number_of_episodes ?? null,
    firstAirDate: item.first_air_date || null,
    lastAirDate: item.last_air_date || null,
    status: item.status ?? "",
    nextEpisode,
  };
}

const cache = new Map<number, { expiresAt: number; promise: Promise<DiscoverSeriesStatus> }>();
const CACHE_TTL_MS = 60 * 60 * 1_000;

// Cards need only status, without downloading the full cast, providers and recommendations.
export function loadSeriesStatus(tmdbId: number): Promise<DiscoverSeriesStatus> {
  const existing = cache.get(tmdbId);
  if (existing && existing.expiresAt > Date.now()) return existing.promise;
  const promise = tmdbRequest<RawTitleDetails>(`/tv/${tmdbId}`)
    .then(toSeriesStatus)
    .catch((error) => {
      cache.delete(tmdbId);
      throw error;
    });
  if (cache.size >= 500) cache.delete(cache.keys().next().value!);
  cache.set(tmdbId, { expiresAt: Date.now() + CACHE_TTL_MS, promise });
  return promise;
}
