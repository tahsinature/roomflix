import { COMPARISON_COLUMN_IDS, type ComparisonColumnId, type RecommendationSort, type UserPreferences, type UserPreferencesPatch } from "@/protocol.ts";

const RECOMMENDATION_SORTS = new Set<RecommendationSort>(["recommended", "rating", "newest", "oldest", "title"]);

export function defaultUserPreferences(): UserPreferences {
  return {
    discover: {
      moreLikeThisSort: "recommended",
      compareColumns: [...COMPARISON_COLUMN_IDS],
      compareColumnOrder: [...COMPARISON_COLUMN_IDS],
    },
  };
}

// Persisted users created before preferences existed have no nested object.
// Normalize at the storage boundary so every API response has a stable shape.
export function normalizeUserPreferences(value: unknown): UserPreferences {
  const preferences = isRecord(value) ? value : {};
  const discover = isRecord(preferences.discover) ? preferences.discover : {};
  const moreLikeThisSort = discover.moreLikeThisSort;

  return {
    discover: {
      moreLikeThisSort: isRecommendationSort(moreLikeThisSort) ? moreLikeThisSort : "recommended",
      compareColumns: isComparisonColumns(discover.compareColumns) ? [...new Set(discover.compareColumns)] : [...COMPARISON_COLUMN_IDS],
      compareColumnOrder: normalizeComparisonColumnOrder(discover.compareColumnOrder),
    },
  };
}

export type UserPreferencesParseResult = { ok: true; value: UserPreferencesPatch } | { ok: false; error: string };

export function parseUserPreferencesPatch(value: unknown): UserPreferencesParseResult {
  if (!isRecord(value)) return { ok: false, error: "preferences must be an object" };
  if (!isRecord(value.discover)) return { ok: false, error: "discover preferences must be an object" };

  const patch: NonNullable<UserPreferencesPatch["discover"]> = {};
  if ("moreLikeThisSort" in value.discover) {
    if (!isRecommendationSort(value.discover.moreLikeThisSort)) return { ok: false, error: "moreLikeThisSort must be recommended, rating, newest, oldest, or title" };
    patch.moreLikeThisSort = value.discover.moreLikeThisSort;
  }
  if ("compareColumns" in value.discover) {
    if (!isComparisonColumns(value.discover.compareColumns))
      return { ok: false, error: "compareColumns must contain only imdbRating, tmdbRating, releaseDate, genres, or runtime" };
    patch.compareColumns = [...new Set(value.discover.compareColumns)];
  }
  if ("compareColumnOrder" in value.discover) {
    if (!isComparisonColumnOrder(value.discover.compareColumnOrder)) return { ok: false, error: "compareColumnOrder must contain each comparison column exactly once" };
    patch.compareColumnOrder = [...value.discover.compareColumnOrder];
  }
  if (!Object.keys(patch).length) return { ok: false, error: "No supported discover preferences provided" };
  return { ok: true, value: { discover: patch } };
}

function isComparisonColumns(value: unknown): value is ComparisonColumnId[] {
  return Array.isArray(value) && value.every((column) => typeof column === "string" && (COMPARISON_COLUMN_IDS as readonly string[]).includes(column));
}

function isComparisonColumnOrder(value: unknown): value is ComparisonColumnId[] {
  return isComparisonColumns(value) && value.length === COMPARISON_COLUMN_IDS.length && new Set(value).size === COMPARISON_COLUMN_IDS.length;
}

function isRecommendationSort(value: unknown): value is RecommendationSort {
  return typeof value === "string" && RECOMMENDATION_SORTS.has(value as RecommendationSort);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeComparisonColumnOrder(value: unknown): ComparisonColumnId[] {
  if (isComparisonColumnOrder(value)) return [...value];
  // Preserve account ordering saved before the TMDB column was introduced.
  const legacyColumns = COMPARISON_COLUMN_IDS.filter((column) => column !== "tmdbRating");
  if (isComparisonColumns(value) && value.length === legacyColumns.length && new Set(value).size === legacyColumns.length && !value.includes("tmdbRating")) {
    return [...value, "tmdbRating"];
  }
  return [...COMPARISON_COLUMN_IDS];
}
