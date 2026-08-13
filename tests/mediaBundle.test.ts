import { describe, expect, test } from "bun:test";
import type { Video } from "../server/protocol";
import { parseMediaBundleText, toCreateSubtitles, toMediaBundle } from "../client/src/lib/mediaBundle";

const video: Video = {
  id: "video-1",
  spaceId: "space-1",
  addedBy: "user-1",
  title: "Example movie",
  url: "https://media.example/movie.mp4",
  subtitles: [{ id: "subtitle-1", url: "https://media.example/english.vtt", label: "English", lang: "en" }],
  addedAt: 100,
  updatedAt: 200,
};

describe("media bundles", () => {
  test("exports only portable media fields", () => {
    expect(toMediaBundle(video)).toEqual({
      kind: "roomflix-media",
      version: 1,
      media: {
        title: "Example movie",
        url: "https://media.example/movie.mp4",
        subtitles: [{ url: "https://media.example/english.vtt", label: "English" }],
      },
    });
  });

  test("parses a valid bundle and creates fresh subtitle identities", () => {
    const parsed = parseMediaBundleText(JSON.stringify(toMediaBundle(video)));
    expect(parsed).toEqual({
      ok: true,
      media: {
        title: "Example movie",
        url: "https://media.example/movie.mp4",
        subtitles: [{ url: "https://media.example/english.vtt", label: "English" }],
      },
    });
    if (!parsed.ok) throw new Error(parsed.reason);
    expect(toCreateSubtitles(parsed.media.subtitles)).toEqual([{ id: "", url: "https://media.example/english.vtt", label: "English", lang: "" }]);
  });

  test("rejects unrelated JSON and unsupported versions", () => {
    expect(parseMediaBundleText('{"kind":"roomflix-storage-connection","version":1}')).toEqual({
      ok: false,
      reason: "Not a Roomflix media bundle (wrong kind).",
    });
    expect(parseMediaBundleText('{"kind":"roomflix-media","version":2,"media":{}}')).toEqual({
      ok: false,
      reason: "Unsupported media bundle version: 2.",
    });
  });

  test("rejects invalid media and subtitle URLs", () => {
    expect(parseMediaBundleText('{"kind":"roomflix-media","version":1,"media":{"title":"Movie","url":"file:///movie.mp4","subtitles":[]}}')).toEqual({
      ok: false,
      reason: "The media URL must use http:// or https://.",
    });
    expect(
      parseMediaBundleText(
        '{"kind":"roomflix-media","version":1,"media":{"title":"Movie","url":"https://media.example/movie.mp4","subtitles":[{"url":"not-a-url","label":"English"}]}}',
      ),
    ).toEqual({ ok: false, reason: "Subtitle 1 URL must use http:// or https://." });
  });
});
