import { describe, expect, test } from "bun:test";
import { findFuzzyCandidates, findFuzzyCandidatesInEntries, searchSimilarity, type SearchIndexEntry } from "../server/discovery/fuzzy-search";

describe("server-backed fuzzy discovery", () => {
  test("tolerates misspellings and reversed word order", () => {
    expect(searchSimilarity("Leam Ne", "Liam Neeson")).toBeGreaterThan(0.6);
    expect(searchSimilarity("Incepton", "Inception")).toBeGreaterThan(0.8);
    expect(searchSimilarity("Neeson Liam", "Liam Neeson")).toBe(1);
  });

  test("finds expected people and titles in the bundled TMDB index", async () => {
    const document = (await Bun.file("server/data/tmdb-search-index.json").json()) as { entries: SearchIndexEntry[] };
    const personMatches = findFuzzyCandidatesInEntries(document.entries, "Leam Ne");
    const titleMatches = findFuzzyCandidatesInEntries(document.entries, "Incepton");

    expect(personMatches.people.map((match) => match.name)).toContain("Liam Neeson");
    expect(personMatches.titles).toEqual([]);
    expect(titleMatches.titles.map((match) => match.name)).toContain("Inception");
    expect(titleMatches.people).toEqual([]);
  });

  test("loads the index relative to the server module", async () => {
    const matches = await findFuzzyCandidates("Leam Ne");
    expect(matches.people.map((match) => match.name)).toContain("Liam Neeson");
  });
});
