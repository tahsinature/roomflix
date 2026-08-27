import type { RecommendationSort, UserPreferences, UserPreferencesPatch } from "@/protocol.ts";

const RECOMMENDATION_SORTS = new Set<RecommendationSort>(["recommended", "rating", "newest", "oldest", "title"]);

export function defaultUserPreferences(): UserPreferences {
  return {
    discover: {
      moreLikeThisSort: "recommended",
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
    },
  };
}

export type UserPreferencesParseResult = { ok: true; value: UserPreferencesPatch } | { ok: false; error: string };

export function parseUserPreferencesPatch(value: unknown): UserPreferencesParseResult {
  if (!isRecord(value)) return { ok: false, error: "preferences must be an object" };
  if (!isRecord(value.discover)) return { ok: false, error: "discover preferences must be an object" };

  const moreLikeThisSort = value.discover.moreLikeThisSort;
  if (!isRecommendationSort(moreLikeThisSort)) {
    return { ok: false, error: "moreLikeThisSort must be recommended, rating, newest, oldest, or title" };
  }

  return {
    ok: true,
    value: {
      discover: { moreLikeThisSort },
    },
  };
}

function isRecommendationSort(value: unknown): value is RecommendationSort {
  return typeof value === "string" && RECOMMENDATION_SORTS.has(value as RecommendationSort);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
