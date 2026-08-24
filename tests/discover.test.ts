import { describe, expect, test } from "bun:test";
import { formatPulseTime, recapAt } from "../client/src/features/discover/pulse-data";
import { externalTitleActions } from "../client/src/features/discover/title-actions";
import { toTitleDetails } from "../server/discovery/tmdb-normalizers";

describe("Pulse Lab prototype helpers", () => {
  test("formats playback boundaries", () => {
    expect(formatPulseTime(20)).toBe("20:00");
    expect(formatPulseTime(90)).toBe("1:30:00");
  });

  test("moves recap language through stable viewing phases", () => {
    expect(recapAt(20, 90).phase).toContain("setup");
    expect(recapAt(45, 90).phase).toContain("connecting");
    expect(recapAt(75, 90).phase).toContain("converging");
  });
});

describe("discovery detail parity", () => {
  test("normalizes movie and series certifications by country", () => {
    const movie = toTitleDetails(
      {
        id: 1,
        title: "Movie",
        release_dates: { results: [{ iso_3166_1: "CA", release_dates: [{ certification: "" }, { certification: "14A" }] }] },
      },
      "movie",
    );
    const series = toTitleDetails(
      { id: 2, name: "Series", content_ratings: { results: [{ iso_3166_1: "US", rating: "TV-14" }] } },
      "tv",
    );

    expect(movie.certifications).toEqual({ CA: "14A" });
    expect(series.certifications).toEqual({ US: "TV-14" });
  });

  test("builds fixed external actions without exposing configuration", () => {
    const details = toTitleDetails({ id: 550, title: "Fight Club", release_date: "1999-10-15", external_ids: { imdb_id: "tt0137523" } }, "movie");
    const actions = externalTitleActions(details);

    expect(actions.map((action) => action.id)).toEqual(["extto", "1337x", "imdb", "youtube", "letterboxd", "google", "tmdb"]);
    expect(actions.find((action) => action.id === "extto")?.url).toContain("tt0137523");
  });
});
