import { describe, expect, test } from "bun:test";

import { parseRecentTitleInput } from "@/api/recent_titles.ts";

describe("recent-title API input", () => {
  test("validates metadata while keeping route identity authoritative", () => {
    const parsed = parseRecentTitleInput(
      {
        tmdbId: 999,
        mediaType: "tv",
        title: "  Arrival  ",
        year: "2016",
        releaseDate: "2016-11-10",
        overview: "First contact.",
        posterPath: "/arrival.jpg",
        backdropPath: null,
        voteAverage: 8.1,
        voteCount: 42,
        adult: false,
      },
      { mediaType: "movie", tmdbId: 1 },
    );

    expect(parsed?.mediaType).toBe("movie");
    expect(parsed?.tmdbId).toBe(1);
    expect(parsed?.title).toBe("Arrival");
    expect(parseRecentTitleInput({ title: "   " }, { mediaType: "movie", tmdbId: 1 })).toBeNull();
  });
});
