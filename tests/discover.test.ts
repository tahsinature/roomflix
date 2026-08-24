import { describe, expect, test } from "bun:test";
import { formatPulseTime, recapAt } from "../client/src/features/discover/pulse-data";
import { readWatchBridgeLibrary } from "../client/src/features/migration/watchbridge-import";

describe("WatchBridge discovery migration", () => {
  test("extracts title rows without carrying settings or API keys", () => {
    const items = readWatchBridgeLibrary({
      app: "watchbridge",
      data: {
        settings: { tmdbApiKey: "must-not-cross" },
        library: [{ id: 550, mediaType: "movie", title: "Fight Club", status: "watched" }],
      },
    }) as Array<Record<string, unknown>>;

    expect(items).toHaveLength(1);
    expect(items[0]?.tmdbId).toBe(550);
    expect(items[0]?.tmdbApiKey).toBeUndefined();
  });

  test("rejects unrelated JSON exports", () => {
    expect(() => readWatchBridgeLibrary({ app: "other", data: {} })).toThrow();
  });
});

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
