import { describe, expect, test } from "bun:test";
import { comparisonFinalAirDate, decodeComparisonList, formatReleaseDate, type ComparisonTitle } from "@/features/compare/comparison-data";

const title: ComparisonTitle = {
  id: "movie-329865",
  addedAt: null,
  tmdbId: 329865,
  mediaType: "movie",
  title: "Arrival",
  posterPath: null,
  releaseDate: "2016-11-10",
  lastAirDate: null,
  genres: ["Drama", "Science Fiction"],
  runtime: 116,
  numberOfSeasons: null,
  numberOfEpisodes: null,
  seriesStatus: null,
  nextEpisode: null,
  tmdbRating: 7.6,
  tmdbVotes: 18000,
  imdbId: "tt2543164",
  imdbRating: 7.7,
  imdbVotes: 1_177_133,
  imdbSource: "omdb",
  imdbStatus: "available",
  imdbFetchedAt: "2026-10-01T00:00:00.000Z",
};

describe("saved comparison lists", () => {
  test("preserves TMDB ratings and migrates legacy or malformed values", () => {
    expect(decodeComparisonList(JSON.stringify([title]))[0]).toMatchObject({ tmdbRating: 7.6, tmdbVotes: 18000 });
    const { tmdbRating, tmdbVotes, ...legacy } = title;
    expect(decodeComparisonList(JSON.stringify([legacy]))[0]).toMatchObject({ tmdbRating: null, tmdbVotes: null });
    expect(decodeComparisonList(JSON.stringify([{ ...title, tmdbRating: 11, tmdbVotes: -1 }]))[0]).toMatchObject({ tmdbRating: null, tmdbVotes: null });
  });

  test("preserves final air dates and migrates missing or malformed dates", () => {
    const ended = { ...title, mediaType: "tv", id: "tv-329865", seriesStatus: "Ended", lastAirDate: "2020-06-21" };
    expect(decodeComparisonList(JSON.stringify([ended]))[0]?.lastAirDate).toBe("2020-06-21");
    const { lastAirDate, ...legacy } = ended;
    expect(decodeComparisonList(JSON.stringify([legacy]))[0]?.lastAirDate).toBeNull();
    for (const invalid of ["invalid", "2020-02-30", 123]) {
      expect(decodeComparisonList(JSON.stringify([{ ...ended, lastAirDate: invalid }]))[0]?.lastAirDate).toBeNull();
    }
  });

  test("only presents a final date for ended series with a valid aired date", () => {
    const ended = { ...title, mediaType: "tv" as const, seriesStatus: "Ended", lastAirDate: "2020-06-21" };
    expect(comparisonFinalAirDate(ended, "2026-10-03")).toBe("2020-06-21");
    for (const status of ["Returning Series", "Canceled", "In Production", ""]) {
      expect(comparisonFinalAirDate({ ...ended, seriesStatus: status })).toBeNull();
    }
    for (const date of [null, "2020-02-30", "2010-01-01", "2027-01-01"]) {
      expect(comparisonFinalAirDate({ ...ended, lastAirDate: date }, "2026-10-03")).toBeNull();
    }
    expect(comparisonFinalAirDate({ ...ended, mediaType: "movie" })).toBeNull();
  });

  test("preserves series metadata and safely migrates older rows", () => {
    const series = { ...title, mediaType: "tv", id: "tv-329865", numberOfSeasons: 3, numberOfEpisodes: 24, seriesStatus: "Returning Series" };
    expect(decodeComparisonList(JSON.stringify([series]))[0]).toMatchObject({ numberOfSeasons: 3, numberOfEpisodes: 24, seriesStatus: "Returning Series" });
    const { numberOfSeasons, numberOfEpisodes, seriesStatus, ...legacy } = series;
    expect(decodeComparisonList(JSON.stringify([legacy]))[0]).toMatchObject({ numberOfSeasons: null, numberOfEpisodes: null, seriesStatus: null });
    expect(decodeComparisonList(JSON.stringify([{ ...series, numberOfSeasons: -1, numberOfEpisodes: "invalid" }]))[0]).toMatchObject({
      numberOfSeasons: null,
      numberOfEpisodes: null,
    });
  });

  test("preserves addition dates and leaves legacy dates unknown", () => {
    const dated = { ...title, addedAt: 1_759_449_600_000 };
    expect(decodeComparisonList(JSON.stringify([dated]))[0]?.addedAt).toBe(dated.addedAt);
    const { addedAt, ...legacy } = title;
    expect(decodeComparisonList(JSON.stringify([legacy]))[0]?.addedAt).toBeNull();
    expect(decodeComparisonList(JSON.stringify([{ ...title, addedAt: "invalid" }]))[0]?.addedAt).toBeNull();
  });

  test("preserves upcoming episodes and safely migrates missing or malformed values", () => {
    const nextEpisode = { seasonNumber: 5, episodeNumber: 1, airDate: "2027-04-15" };
    expect(decodeComparisonList(JSON.stringify([{ ...title, nextEpisode }]))[0]?.nextEpisode).toEqual(nextEpisode);
    const { nextEpisode: _, ...legacy } = title;
    expect(decodeComparisonList(JSON.stringify([legacy]))[0]?.nextEpisode).toBeNull();
    for (const invalid of [{ seasonNumber: -1, episodeNumber: 1, airDate: "" }, { seasonNumber: 1, episodeNumber: "invalid", airDate: "" }, "invalid"]) {
      expect(decodeComparisonList(JSON.stringify([{ ...title, nextEpisode: invalid }]))[0]?.nextEpisode).toBeNull();
    }
  });
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
