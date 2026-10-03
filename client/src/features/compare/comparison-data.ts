import type { DiscoverMediaType, DiscoverSearchResult, ImdbRatings } from "@shared/protocol";
import { titleIdentity } from "@/features/discover/discover-utils";
import { loadImdbRatings } from "@/features/discover/imdb-ratings-cache";
import { loadTitleDetails } from "@/features/discover/title-details-cache";

export type ComparisonTitle = {
  id: string;
  tmdbId: number;
  mediaType: DiscoverMediaType;
  title: string;
  posterPath: string | null;
  releaseDate: string;
  genres: string[];
  runtime: number | null;
  imdbId: string | null;
  imdbRating: number | null;
  imdbVotes: number | null;
  imdbSource: "omdb";
  imdbStatus: ImdbRatings["status"];
  imdbFetchedAt: string | null;
};

export function comparisonRatings(ratings: ImdbRatings) {
  return { imdbRating: ratings.rating, imdbVotes: ratings.votes, imdbSource: "omdb" as const, imdbStatus: ratings.status, imdbFetchedAt: ratings.fetchedAt };
}

export async function loadComparisonTitle(selection: DiscoverSearchResult): Promise<ComparisonTitle> {
  const details = await loadTitleDetails(selection);
  const ratings = await loadImdbRatings(details.imdbId);
  return {
    id: titleIdentity(details),
    tmdbId: details.tmdbId,
    mediaType: details.mediaType,
    title: details.title,
    posterPath: details.posterPath,
    releaseDate: details.releaseDate,
    genres: details.genres,
    runtime: details.runtime,
    imdbId: details.imdbId,
    ...comparisonRatings(ratings),
  };
}

export function decodeComparisonList(raw: string | null): ComparisonTitle[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    return parsed
      .filter((value) => {
        if (!isComparisonTitle(value) || seen.has(value.id)) return false;
        seen.add(value.id);
        return true;
      })
      .map((row) =>
        row.imdbSource === "demo"
          ? {
              ...row,
              ...comparisonRatings({ rating: null, votes: null, status: "unavailable", fetchedAt: null }),
            }
          : row,
      );
  } catch {
    return [];
  }
}

function isComparisonTitle(value: unknown): value is ComparisonTitle | (Omit<ComparisonTitle, "imdbSource" | "imdbStatus" | "imdbFetchedAt"> & { imdbSource: "demo" }) {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    Number.isSafeInteger(row.tmdbId) &&
    (row.tmdbId as number) > 0 &&
    (row.mediaType === "movie" || row.mediaType === "tv") &&
    row.id === `${row.mediaType}-${row.tmdbId}` &&
    typeof row.title === "string" &&
    (row.posterPath === null || typeof row.posterPath === "string") &&
    typeof row.releaseDate === "string" &&
    Array.isArray(row.genres) &&
    row.genres.every((genre) => typeof genre === "string") &&
    (row.runtime === null || (typeof row.runtime === "number" && Number.isFinite(row.runtime) && row.runtime >= 0)) &&
    (row.imdbId === null || typeof row.imdbId === "string") &&
    (row.imdbRating === null || (typeof row.imdbRating === "number" && Number.isFinite(row.imdbRating) && row.imdbRating >= 0 && row.imdbRating <= 10)) &&
    (row.imdbVotes === null || (Number.isSafeInteger(row.imdbVotes) && (row.imdbVotes as number) >= 0)) &&
    (row.imdbSource === "demo" ||
      (row.imdbSource === "omdb" &&
        ["available", "not_found", "not_configured", "invalid_key", "quota_exceeded", "unauthorized", "unavailable"].includes(row.imdbStatus as string) &&
        (row.imdbFetchedAt === null || (typeof row.imdbFetchedAt === "string" && Number.isFinite(Date.parse(row.imdbFetchedAt))))))
  );
}

const releaseDateFormatter = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

export function formatReleaseDate(value: string): string {
  if (!value) return "Unknown";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown" : releaseDateFormatter.format(date);
}
