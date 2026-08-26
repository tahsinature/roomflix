import { describe, expect, test } from "bun:test";
import { formatPulseTime, recapAt } from "../client/src/features/discover/pulse-data";
import { externalTitleActions } from "../client/src/features/discover/title-actions";
import { discoverPersonPhotosPath, discoverTitlePhotosPath } from "../client/src/features/discover/discover-utils";
import { toImageGallery, toTitleDetails } from "../server/discovery/tmdb-normalizers";

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
    const series = toTitleDetails({ id: 2, name: "Series", content_ratings: { results: [{ iso_3166_1: "US", rating: "TV-14" }] } }, "tv");

    expect(movie.certifications).toEqual({ CA: "14A" });
    expect(series.certifications).toEqual({ US: "TV-14" });
  });

  test("builds fixed external actions without exposing configuration", () => {
    const details = toTitleDetails({ id: 550, title: "Fight Club", release_date: "1999-10-15", external_ids: { imdb_id: "tt0137523" } }, "movie");
    const actions = externalTitleActions(details);

    expect(actions.map((action) => action.id)).toEqual(["extto", "1337x", "imdb", "youtube", "letterboxd", "google", "tmdb"]);
    expect(actions.find((action) => action.id === "extto")?.url).toContain("tt0137523");
  });

  test("normalizes deduplicated photo collections with stable kinds", () => {
    const gallery = toImageGallery("Example", "movie", {
      backdrops: [
        { file_path: "/wide.jpg", width: 1920, height: 1080 },
        { file_path: "/wide.jpg", width: 1920, height: 1080 },
      ],
      posters: [{ file_path: "/poster.jpg", width: 1000, height: 1500, vote_average: 5.2, vote_count: 4 }],
    });

    expect(gallery.subjectName).toBe("Example");
    expect(gallery.images).toHaveLength(2);
    expect(gallery.images.map((image) => image.kind)).toEqual(["backdrop", "poster"]);
    expect(gallery.images[0]?.aspectRatio).toBeCloseTo(16 / 9);
  });

  test("builds route-backed photo paths without query parameters", () => {
    expect(discoverTitlePhotosPath({ mediaType: "movie", tmdbId: 1084244 })).toBe("/discover/movie/1084244/photos");
    expect(discoverPersonPhotosPath(31)).toBe("/discover/person/31/photos");
  });
});
