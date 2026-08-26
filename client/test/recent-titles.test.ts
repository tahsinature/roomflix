import { describe, expect, test } from "bun:test";
import type { RecentTitleItem } from "@shared/protocol";
import { filterAndSortRecentTitles, mergeRecentTitleLists } from "@/features/discover/recent-titles";

describe("account recent-title history", () => {
  const now = Date.UTC(2026, 7, 26, 12);
  const recentTitle = (overrides: Partial<RecentTitleItem>): RecentTitleItem => ({
    id: "recent-1",
    userId: "user-1",
    tmdbId: 1,
    mediaType: "movie",
    title: "Arrival",
    year: "2016",
    releaseDate: "2016-11-10",
    overview: "",
    posterPath: null,
    backdropPath: null,
    voteAverage: 8,
    voteCount: 10,
    adult: false,
    lastViewedAt: now,
    viewCount: 1,
    ...overrides,
  });

  test("filters by title and recent time windows, then sorts by view count", () => {
    const titles = [
      recentTitle({ id: "arrival", tmdbId: 1, title: "Arrival", lastViewedAt: now - 2 * 24 * 60 * 60 * 1_000, viewCount: 2 }),
      recentTitle({ id: "alien", tmdbId: 2, title: "Alien", lastViewedAt: now - 6 * 24 * 60 * 60 * 1_000, viewCount: 8 }),
      recentTitle({ id: "old", tmdbId: 3, title: "Old", lastViewedAt: now - 40 * 24 * 60 * 60 * 1_000, viewCount: 20 }),
    ];

    expect(filterAndSortRecentTitles(titles, { query: "ali", range: "week", sort: "most-viewed", now }).map((title) => title.title)).toEqual(["Alien"]);
    expect(filterAndSortRecentTitles(titles, { query: "", range: "month", sort: "most-viewed", now }).map((title) => title.title)).toEqual(["Alien", "Arrival"]);
  });

  test("merges duplicate titles by their latest server timestamp", () => {
    const older = recentTitle({ id: "older", lastViewedAt: now - 1_000, viewCount: 2 });
    const newer = recentTitle({ id: "newer", lastViewedAt: now, viewCount: 3 });
    const merged = mergeRecentTitleLists([older], [newer]);

    expect(merged).toHaveLength(1);
    expect(merged[0]?.id).toBe("newer");
    expect(merged[0]?.viewCount).toBe(3);
  });

  test("retains no more than the newest 500 unique titles", () => {
    const titles = Array.from({ length: 505 }, (_, index) => recentTitle({ id: `recent-${index}`, tmdbId: index + 1, title: `Title ${index}`, lastViewedAt: now - index }));
    const merged = mergeRecentTitleLists([], titles);

    expect(merged).toHaveLength(500);
    expect(merged.at(-1)?.tmdbId).toBe(500);
  });
});
