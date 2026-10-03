import type { DiscoverMediaType, DiscoverSearchResult } from "@shared/protocol";
import { titleIdentity } from "@/features/discover/discover-utils";
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
  imdbRating: number;
  imdbVotes: number;
  imdbSource: "demo";
};

// Replace this adapter with an IMDb data provider when one is available.
// Stable sample values keep comparisons consistent across reloads.
export async function fetchDemoImdbRating(title: Pick<DiscoverSearchResult, "tmdbId" | "mediaType">) {
  await new Promise((resolve) => window.setTimeout(resolve, 450));
  const seed = (Math.imul(title.tmdbId, 2654435761) + (title.mediaType === "tv" ? 7919 : 0)) >>> 0;
  return { imdbRating: (64 + (seed % 29)) / 10, imdbVotes: 8_500 + (seed % 1_800_000), imdbSource: "demo" as const };
}

export async function loadComparisonTitle(selection: DiscoverSearchResult): Promise<ComparisonTitle> {
  const [details, ratings] = await Promise.all([loadTitleDetails(selection), fetchDemoImdbRating(selection)]);
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
    ...ratings,
  };
}

export function decodeComparisonList(raw: string | null): ComparisonTitle[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    return parsed.filter((value): value is ComparisonTitle => {
      if (!isComparisonTitle(value) || seen.has(value.id)) return false;
      seen.add(value.id);
      return true;
    });
  } catch {
    return [];
  }
}

function isComparisonTitle(value: unknown): value is ComparisonTitle {
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
    typeof row.imdbRating === "number" &&
    row.imdbRating >= 0 &&
    row.imdbRating <= 10 &&
    Number.isSafeInteger(row.imdbVotes) &&
    (row.imdbVotes as number) >= 0 &&
    row.imdbSource === "demo"
  );
}

const releaseDateFormatter = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

export function formatReleaseDate(value: string): string {
  if (!value) return "Unknown";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown" : releaseDateFormatter.format(date);
}
