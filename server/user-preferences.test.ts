import { describe, expect, test } from "bun:test";

import { normalizeUserPreferences, parseUserPreferencesPatch } from "@/user-preferences.ts";

describe("account user preferences", () => {
  test("defaults legacy and invalid stored values to the recommended ranking", () => {
    expect(normalizeUserPreferences(undefined).discover.moreLikeThisSort).toBe("recommended");
    expect(normalizeUserPreferences({ discover: { moreLikeThisSort: "unsupported" } }).discover.moreLikeThisSort).toBe("recommended");
  });

  test("preserves a valid stored More Like This sort", () => {
    expect(normalizeUserPreferences({ discover: { moreLikeThisSort: "rating" } }).discover.moreLikeThisSort).toBe("rating");
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
