import { describe, expect, test } from "bun:test";
import { formatPulseTime, recapAt } from "../client/src/features/discover/pulse-data";
import { externalTitleActions } from "../client/src/features/discover/title-actions";
import { discoverEpisodePath, discoverPersonPhotosPath, discoverTitlePhotosPath, parseDiscoverEpisodeRoute } from "../client/src/features/discover/discover-utils";
import { sortRecommendations } from "../client/src/features/discover/recommendation-sort";
import { toEpisodeDetails, toImageGallery, toSeasonDetails, toTitleDetails } from "../server/discovery/tmdb-normalizers";

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

  test("keeps Specials and regular season summaries on series details", () => {
    const series = toTitleDetails(
      {
        id: 2,
        name: "Series",
        seasons: [
          { id: 20, season_number: 0, name: "Specials", episode_count: 3 },
          { id: 21, season_number: 1, name: "Season 1", episode_count: 8, air_date: "2026-01-04" },
        ],
      },
      "tv",
    );

    expect(series.seasons.map((season) => season.seasonNumber)).toEqual([0, 1]);
    expect(series.seasons[0]?.name).toBe("Specials");
    expect(series.seasons[1]?.episodeCount).toBe(8);
  });

  test("normalizes season episodes and deduplicates episode credits", () => {
    const season = toSeasonDetails({
      id: 21,
      season_number: 1,
      name: "Season 1",
      episodes: [{ id: 101, season_number: 1, episode_number: 1, name: "Pilot", runtime: 52, still_path: "/pilot.jpg" }],
    });
    const episode = toEpisodeDetails(
      {
        id: 101,
        season_number: 1,
        episode_number: 1,
        name: "Pilot",
        crew: [{ id: 7, name: "A. Director", job: "Director" }],
        credits: {
          crew: [{ id: 7, name: "A. Director", job: "Director" }],
          cast: [{ id: 8, name: "Lead", character: "Sam" }],
        },
        guest_stars: [
          { id: 8, name: "Lead", character: "Sam" },
          { id: 9, name: "Guest", character: "Alex" },
        ],
      },
      42,
    );

    expect(season.episodes[0]?.runtime).toBe(52);
    expect(episode.seriesTmdbId).toBe(42);
    expect(episode.directors).toHaveLength(1);
    expect(episode.cast.map((person) => person.name)).toEqual(["Lead", "Guest"]);
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

  test("builds and parses dedicated episode routes, including Specials", () => {
    const special = { seriesTmdbId: 1399, seasonNumber: 0, episodeNumber: 2 };
    expect(discoverEpisodePath(special)).toBe("/discover/tv/1399/season/0/episode/2");
    expect(parseDiscoverEpisodeRoute("tv", "1399", "0", "2")).toEqual(special);
    expect(parseDiscoverEpisodeRoute("movie", "1399", "0", "2")).toBeNull();
    expect(parseDiscoverEpisodeRoute("tv", "1399", "1", "0")).toBeNull();
  });

  test("sorts recommendations while preserving the original ranking by default", () => {
    const titles = [
      {
        tmdbId: 1,
        mediaType: "movie" as const,
        title: "Zulu",
        year: "2024",
        releaseDate: "2024-01-01",
        overview: "",
        posterPath: null,
        backdropPath: null,
        voteAverage: 6,
        voteCount: 100,
        adult: false,
      },
      {
        tmdbId: 2,
        mediaType: "movie" as const,
        title: "Alpha",
        year: "2020",
        releaseDate: "2020-01-01",
        overview: "",
        posterPath: null,
        backdropPath: null,
        voteAverage: 8,
        voteCount: 50,
        adult: false,
      },
      {
        tmdbId: 3,
        mediaType: "movie" as const,
        title: "Unknown",
        year: "",
        releaseDate: "",
        overview: "",
        posterPath: null,
        backdropPath: null,
        voteAverage: 7,
        voteCount: 75,
        adult: false,
      },
    ];

    expect(sortRecommendations(titles, "recommended").map((title) => title.tmdbId)).toEqual([1, 2, 3]);
    expect(sortRecommendations(titles, "rating").map((title) => title.tmdbId)).toEqual([2, 3, 1]);
    expect(sortRecommendations(titles, "newest").map((title) => title.tmdbId)).toEqual([1, 2, 3]);
    expect(sortRecommendations(titles, "oldest").map((title) => title.tmdbId)).toEqual([2, 1, 3]);
    expect(sortRecommendations(titles, "title").map((title) => title.tmdbId)).toEqual([2, 3, 1]);
  });
});
