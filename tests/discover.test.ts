import { describe, expect, test } from "bun:test";
import { formatPulseTime, recapAt } from "../client/src/features/discover/pulse-data";

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
