import { describe, expect, test } from "bun:test";

import { normalizeUserPreferences, parseUserPreferencesPatch } from "@/user-preferences.ts";
import { COMPARISON_COLUMN_IDS, type ComparisonColumnId } from "@/protocol.ts";

describe("account user preferences", () => {
  test("defaults legacy and invalid stored values to the recommended ranking", () => {
    expect(normalizeUserPreferences(undefined).discover.moreLikeThisSort).toBe("recommended");
    expect(normalizeUserPreferences({ discover: { moreLikeThisSort: "unsupported" } }).discover.moreLikeThisSort).toBe("recommended");
  });

  test("preserves a valid stored More Like This sort", () => {
    expect(normalizeUserPreferences({ discover: { moreLikeThisSort: "rating" } }).discover.moreLikeThisSort).toBe("rating");
  });

  test("defaults legacy column settings and preserves empty or partial selections", () => {
    const defaults = [...COMPARISON_COLUMN_IDS];
    expect(normalizeUserPreferences(undefined).discover.compareColumns).toEqual(defaults);
    expect(normalizeUserPreferences({ discover: { compareColumns: ["title"] } }).discover.compareColumns).toEqual(defaults);
    expect(normalizeUserPreferences({ discover: { compareColumns: [] } }).discover.compareColumns).toEqual([]);
    expect(normalizeUserPreferences({ discover: { compareColumns: ["runtime", "runtime", "genres"] } }).discover.compareColumns).toEqual(["runtime", "genres"]);
  });

  test("accepts the TMDB column while preserving an existing visibility selection", () => {
    expect(parseUserPreferencesPatch({ discover: { compareColumns: ["tmdbRating", "imdbRating"] } }).ok).toBe(true);
    expect(normalizeUserPreferences({ discover: { compareColumns: ["imdbRating"] } }).discover.compareColumns).toEqual(["imdbRating"]);
  });

  test("accepts column updates independently without replacing the ranking preference", () => {
    expect(parseUserPreferencesPatch({ discover: { compareColumns: ["runtime", "runtime"] } })).toEqual({
      ok: true,
      value: { discover: { compareColumns: ["runtime"] } },
    });
    expect(parseUserPreferencesPatch({ discover: { compareColumns: [], moreLikeThisSort: "rating" } })).toEqual({
      ok: true,
      value: { discover: { compareColumns: [], moreLikeThisSort: "rating" } },
    });
  });

  test("defaults legacy column order and preserves saved order independently of visibility", () => {
    const order = ["runtime", "genres", "imdbRating", "releaseDate"] as const;
    expect(normalizeUserPreferences(undefined).discover.compareColumnOrder).toEqual([...COMPARISON_COLUMN_IDS]);
    const preferences = normalizeUserPreferences({ discover: { compareColumnOrder: order, compareColumns: ["imdbRating"] } });
    expect(preferences.discover.compareColumnOrder).toEqual([...order, "tmdbRating"]);
    expect(preferences.discover.compareColumns).toEqual(["imdbRating"]);
  });

  test("accepts a complete order without overwriting other preferences", () => {
    const order: ComparisonColumnId[] = ["runtime", "genres", "imdbRating", "releaseDate", "tmdbRating"];
    expect(parseUserPreferencesPatch({ discover: { compareColumnOrder: order } })).toEqual({ ok: true, value: { discover: { compareColumnOrder: order } } });
    expect(parseUserPreferencesPatch({ discover: { compareColumns: [], compareColumnOrder: order } })).toEqual({
      ok: true,
      value: { discover: { compareColumns: [], compareColumnOrder: order } },
    });
  });

  test("rejects incomplete or invalid orders and repairs invalid stored orders", () => {
    for (const order of [[], ["runtime"], ["runtime", "genres", "imdbRating", "runtime"], ["title", "genres", "imdbRating", "releaseDate"], "runtime", null]) {
      expect(parseUserPreferencesPatch({ discover: { compareColumnOrder: order } }).ok).toBe(false);
      expect(normalizeUserPreferences({ discover: { compareColumnOrder: order } }).discover.compareColumnOrder).toEqual([...COMPARISON_COLUMN_IDS]);
    }
  });

  test("rejects unsupported columns and empty patches", () => {
    for (const compareColumns of [["title"], ["actions"], [1], "runtime", null]) {
      expect(parseUserPreferencesPatch({ discover: { compareColumns } }).ok).toBe(false);
    }
    expect(parseUserPreferencesPatch({ discover: {} }).ok).toBe(false);
  });

  test("accepts only supported More Like This preference updates", () => {
    expect(parseUserPreferencesPatch({ discover: { moreLikeThisSort: "newest" } })).toEqual({
      ok: true,
      value: { discover: { moreLikeThisSort: "newest" } },
    });
    expect(parseUserPreferencesPatch({ discover: { moreLikeThisSort: "popular" } })).toEqual({
      ok: false,
      error: "moreLikeThisSort must be recommended, rating, newest, oldest, or title",
    });
    expect(parseUserPreferencesPatch({})).toEqual({
      ok: false,
      error: "discover preferences must be an object",
    });
  });
});
