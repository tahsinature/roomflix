import { describe, expect, test } from "bun:test";
import { seriesCountSummary, seriesStatusPresentation } from "@/features/discover/series-status";

const nextEpisode = { seasonNumber: 5, episodeNumber: 1, airDate: "2027-04-15" };
const today = "2026-10-03";

describe("series lifecycle indications", () => {
  test("summarizes known season and episode counts without inventing missing values", () => {
    expect(seriesCountSummary({ numberOfSeasons: 5, numberOfEpisodes: 103 })).toBe("5 seasons · 103 episodes");
    expect(seriesCountSummary({ numberOfSeasons: 1, numberOfEpisodes: 1 })).toBe("1 season · 1 episode");
    expect(seriesCountSummary({ numberOfSeasons: null, numberOfEpisodes: 8 })).toBe("8 episodes");
    expect(seriesCountSummary({ numberOfSeasons: 0, numberOfEpisodes: 0 })).toBe("0 seasons · 0 episodes");
    expect(seriesCountSummary({})).toBeNull();
    expect(seriesCountSummary({ numberOfSeasons: -1, numberOfEpisodes: NaN })).toBeNull();
  });

  test("keeps a returning series active even without a scheduled episode", () => {
    const result = seriesStatusPresentation({ status: "Returning Series", nextEpisode: null }, today);
    expect(result.label).toBe("Returning");
    expect(result.active).toBe(true);
    expect(result.nextLabel).toBeNull();
    expect(result.tooltip).toContain("does not confirm renewal");
    expect(result.tooltip).toContain("date unknown");
  });

  test("includes the next season and episode when a future date is listed", () => {
    const result = seriesStatusPresentation({ status: "Returning Series", nextEpisode }, today);
    expect(result.nextLabel).toContain("2027");
    expect(result.tooltip).toContain("S5 E1");
  });

  test("does not present stale or malformed dates as an upcoming release", () => {
    for (const airDate of ["2025-10-03", "", "invalid", "2027-02-30"]) {
      expect(seriesStatusPresentation({ status: "Returning Series", nextEpisode: { ...nextEpisode, airDate } }, today).nextLabel).toBeNull();
    }
  });

  test("distinguishes ended and cancelled without showing stale next episodes", () => {
    const ended = seriesStatusPresentation({ status: "Ended", nextEpisode }, today);
    const cancelled = seriesStatusPresentation({ status: "Canceled", nextEpisode }, today);
    expect(ended.label).toBe("Ended");
    expect(cancelled.label).toBe("Cancelled");
    expect(ended.nextLabel).toBeNull();
    expect(cancelled.active).toBe(false);
  });

  test("never guesses completion from a missing or unfamiliar status", () => {
    for (const status of ["", "Unannounced", "constructor", "toString"]) {
      expect(seriesStatusPresentation({ status, nextEpisode: null }, today).label).toBe("Status unknown");
    }
  });
});
