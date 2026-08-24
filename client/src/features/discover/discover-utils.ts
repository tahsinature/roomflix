import type { DiscoverMediaType, DiscoverSearchResult, DiscoverTitleDetails, TitleLibraryItem, TitleLibraryStatus } from "@shared/protocol";

const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";

export function posterUrl(path: string | null, size = "w500"): string | null {
  return path ? `${TMDB_IMAGE_BASE}/${size}${path}` : null;
}

export function backdropUrl(path: string | null): string | null {
  return path ? `${TMDB_IMAGE_BASE}/w1280${path}` : null;
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

export type TitleSelection = {
  mediaType: DiscoverMediaType;
  tmdbId: number;
  title?: string;
};
