import { describe, expect, test } from "bun:test";
import { decodeComparisonList, formatReleaseDate, type ComparisonTitle } from "@/features/compare/comparison-data";

const title: ComparisonTitle = {
  id: "movie-329865",
  tmdbId: 329865,
  mediaType: "movie",
  title: "Arrival",
  posterPath: null,
  releaseDate: "2016-11-10",
  genres: ["Drama", "Science Fiction"],
  runtime: 116,
  imdbId: "tt2543164",
  imdbRating: 7.7,
  imdbVotes: 1_177_133,
  imdbSource: "omdb",
  imdbStatus: "available",
  imdbFetchedAt: "2026-10-01T00:00:00.000Z",
};

describe("saved comparison lists", () => {
  test("recovers usable rows without accepting malformed or duplicate entries", () => {
    const series = { ...title, id: "tv-329865", mediaType: "tv", runtime: null };
    const stored = JSON.stringify([title, null, { ...title, id: "wrong-id" }, { ...series, imdbVotes: "100000" }, title, series]);
    expect(decodeComparisonList(stored)).toEqual([title, series]);
  });

  test("handles missing, corrupt, and obsolete stored data without crashing", () => {
    for (const raw of [null, "not json", "{}", "[{}]", JSON.stringify([{ ...title, imdbRating: 11 }]), JSON.stringify([{ ...title, imdbSource: "unknown" }])]) {
      expect(decodeComparisonList(raw)).toEqual([]);
    }
  });

  test("keeps legacy titles and order but discards simulated IMDb values", () => {
    const legacy = { ...title, imdbSource: "demo" };
    const result = decodeComparisonList(JSON.stringify([legacy]));
    expect(result[0]?.id).toBe(title.id);
    expect(result[0]?.imdbRating).toBeNull();
    expect(result[0]?.imdbVotes).toBeNull();
    expect(result[0]?.imdbSource).toBe("omdb");
  });

  test("reports missing and invalid release dates as unknown", () => {
    expect(formatReleaseDate("")).toBe("Unknown");
    expect(formatReleaseDate("invalid-date")).toBe("Unknown");
    expect(formatReleaseDate("2016-11-10")).toContain("2016");
  });
});
