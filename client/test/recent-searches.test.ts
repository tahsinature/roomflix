import { describe, expect, test } from "bun:test";
import { addRecentSearch, decodeRecentSearches } from "@/features/discover/recent-searches";

describe("recent search terms", () => {
  test("moves repeated searches to the front without duplicates", () => {
    expect(addRecentSearch(["Arrival", "Salt", "The Amateur"], "  the   amateur  ")).toEqual(["the amateur", "Arrival", "Salt"]);
  });

  test("retains the eight most recent submitted terms", () => {
    let terms: string[] = [];
    for (let index = 0; index < 10; index++) terms = addRecentSearch(terms, `Title ${index}`);
    expect(terms).toHaveLength(8);
    expect(terms[0]).toBe("Title 9");
    expect(terms[7]).toBe("Title 2");
    expect(addRecentSearch(terms, " ")).toEqual(terms);
    expect(addRecentSearch(terms, "x".repeat(201))).toEqual(terms);
  });

  test("recovers saved order while rejecting corrupt and malformed data", () => {
    expect(decodeRecentSearches(JSON.stringify(["Arrival", null, "Salt", "arrival", " ", 42]))).toEqual(["Arrival", "Salt"]);
    expect(decodeRecentSearches(null)).toEqual([]);
    expect(decodeRecentSearches("broken")).toEqual([]);
    expect(decodeRecentSearches('{"terms":[]}')).toEqual([]);
  });
});
