import type { DiscoverSearchResult, DiscoverTitleDetails, TitleLibraryItem, TitleLibraryStatus } from "@shared/protocol";

const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";

export function tmdbImageUrl(path: string, size = "original"): string {
  return `${TMDB_IMAGE_BASE}/${size}${path}`;
}

export function posterUrl(path: string | null, size = "w500"): string | null {
  return path ? tmdbImageUrl(path, size) : null;
}

export function backdropUrl(path: string | null): string | null {
  return path ? tmdbImageUrl(path, "w1280") : null;
}

export function formatVotes(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}m`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(value);
}

export function formatRuntime(minutes: number | null): string {
  if (!minutes) return "Runtime unknown";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours ? `${hours}h ${rest}m` : `${rest}m`;
}

export function titleIdentity(item: Pick<DiscoverSearchResult, "mediaType" | "tmdbId">): string {
  return `${item.mediaType}-${item.tmdbId}`;
}

export function discoverTitlePath(item: Pick<DiscoverSearchResult, "mediaType" | "tmdbId">): string {
  return `/discover/${item.mediaType}/${item.tmdbId}`;
}

export function discoverTitlePhotosPath(item: Pick<DiscoverSearchResult, "mediaType" | "tmdbId">): string {
  return `${discoverTitlePath(item)}/photos`;
}

export function discoverEpisodePath(selection: EpisodeSelection): string {
  return `/discover/tv/${selection.seriesTmdbId}/season/${selection.seasonNumber}/episode/${selection.episodeNumber}`;
}

export function discoverPersonPath(tmdbId: number): string {
  return `/discover/person/${tmdbId}`;
}

export function discoverPersonPhotosPath(tmdbId: number): string {
  return `${discoverPersonPath(tmdbId)}/photos`;
}

export function parseDiscoverTitleRoute(mediaType?: string, tmdbId?: string): TitleSelection | null {
  if ((mediaType !== "movie" && mediaType !== "tv") || !tmdbId || !/^\d+$/.test(tmdbId)) return null;

  const parsedId = Number(tmdbId);
  return Number.isSafeInteger(parsedId) && parsedId > 0 ? { mediaType, tmdbId: parsedId } : null;
}

export function parseDiscoverPersonRoute(entityType?: string, tmdbId?: string): number | null {
  if (entityType !== "person" || !tmdbId || !/^\d+$/.test(tmdbId)) return null;

  const parsedId = Number(tmdbId);
  return Number.isSafeInteger(parsedId) && parsedId > 0 ? parsedId : null;
}

export function parseDiscoverEpisodeRoute(entityType?: string, tmdbId?: string, seasonNumber?: string, episodeNumber?: string): EpisodeSelection | null {
  if (entityType !== "tv" || !tmdbId || !seasonNumber || !episodeNumber) return null;
  if (!/^\d+$/.test(tmdbId) || !/^\d+$/.test(seasonNumber) || !/^\d+$/.test(episodeNumber)) return null;

  const parsedSeriesId = Number(tmdbId);
  const parsedSeasonNumber = Number(seasonNumber);
  const parsedEpisodeNumber = Number(episodeNumber);
  return Number.isSafeInteger(parsedSeriesId) &&
    parsedSeriesId > 0 &&
    Number.isSafeInteger(parsedSeasonNumber) &&
    Number.isSafeInteger(parsedEpisodeNumber) &&
    parsedEpisodeNumber > 0
    ? { seriesTmdbId: parsedSeriesId, seasonNumber: parsedSeasonNumber, episodeNumber: parsedEpisodeNumber }
    : null;
}

export function parseLegacyTitleParam(value: string | null): TitleSelection | null {
  const match = value?.match(/^(movie|tv):(\d+)$/);
  return match ? parseDiscoverTitleRoute(match[1], match[2]) : null;
}

export function parseLegacyPersonParam(value: string | null): number | null {
  return value && /^\d+$/.test(value) ? parseDiscoverPersonRoute("person", value) : null;
}

export function libraryItemToSearchResult(item: TitleLibraryItem): DiscoverSearchResult {
  return {
    tmdbId: item.tmdbId,
    mediaType: item.mediaType,
    title: item.title,
    year: item.year,
    releaseDate: item.year,
    overview: item.overview,
    posterPath: item.posterPath,
    backdropPath: item.backdropPath,
    voteAverage: item.voteAverage,
    voteCount: item.voteCount,
    adult: false,
  };
}

export function toLibraryPayload(
  details: DiscoverTitleDetails,
  status: TitleLibraryStatus,
  existing?: TitleLibraryItem,
): Omit<TitleLibraryItem, "id" | "userId" | "addedAt" | "updatedAt"> {
  return {
    tmdbId: details.tmdbId,
    mediaType: details.mediaType,
    title: details.title,
    year: details.year,
    posterPath: details.posterPath,
    backdropPath: details.backdropPath,
    overview: details.overview,
    voteAverage: details.voteAverage,
    voteCount: details.voteCount,
    genres: details.genres,
    runtime: details.runtime,
    imdbId: details.imdbId,
    status,
    userRating: existing?.userRating ?? null,
    notes: existing?.notes ?? "",
    watchedAt: status === "watched" ? (existing?.watchedAt ?? Date.now()) : null,
  };
}

export type TitleSelection = Pick<DiscoverSearchResult, "mediaType" | "tmdbId"> & Partial<Omit<DiscoverSearchResult, "mediaType" | "tmdbId">>;

export type EpisodeSelection = {
  seriesTmdbId: number;
  seasonNumber: number;
  episodeNumber: number;
};
