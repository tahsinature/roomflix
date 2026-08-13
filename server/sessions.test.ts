import { afterEach, describe, expect, test } from "bun:test";
import type { ServerWebSocket } from "bun";

import { endSessionForSpace, getOrCreateSession, syncActiveLibraryEntry, type WsData } from "@/sessions.ts";

const createdSpaces: string[] = [];

afterEach(() => {
  for (const spaceId of createdSpaces.splice(0)) endSessionForSpace(spaceId);
});

describe("syncActiveLibraryEntry", () => {
  test("broadcasts updated metadata for the currently loaded library URL", () => {
    const spaceId = `test-space-${crypto.randomUUID()}`;
    createdSpaces.push(spaceId);
    const session = getOrCreateSession(spaceId);
    session.state.videoUrl = "https://media.example/movie.mp4";
    session.state.videoTitle = "Old title";
    session.state.subtitles = [];
    session.state.currentTime = 42;
    session.state.playing = true;

    const sent: string[] = [];
    session.sockets.add({
      data: {
        spaceId,
        clientId: "client-1",
        userId: "user-1",
        identityId: "user-1",
        identityKind: "user",
        displayName: "Test user",
        status: "watching",
      },
      send: (payload: string) => sent.push(payload),
      close: () => undefined,
    } as unknown as ServerWebSocket<WsData>);

    const changed = syncActiveLibraryEntry(spaceId, {
      url: "https://media.example/movie.mp4",
      title: "New title",
      subtitles: [{ id: "sub-1", url: "https://media.example/en.srt", label: "English", lang: "en" }],
    });

    expect(changed).toBe(true);
    expect(session.state.videoTitle).toBe("New title");
    expect(session.state.subtitles).toHaveLength(1);
    expect(session.state.currentTime).toBe(42);
    expect(session.state.playing).toBe(true);
    expect(sent).toHaveLength(1);
    const message = JSON.parse(sent[0]!) as { type: string; state: { subtitles: unknown[] } };
    expect(message.type).toBe("state");
    expect(message.state.subtitles).toHaveLength(1);
  });

  test("does not change a session playing another URL", () => {
    const spaceId = `test-space-${crypto.randomUUID()}`;
    createdSpaces.push(spaceId);
    const session = getOrCreateSession(spaceId);
    session.state.videoUrl = "https://media.example/other.mp4";

    const changed = syncActiveLibraryEntry(spaceId, {
      url: "https://media.example/movie.mp4",
      title: "Movie",
      subtitles: [{ id: "sub-1", url: "https://media.example/en.srt", label: "English", lang: "en" }],
    });

    expect(changed).toBe(false);
    expect(session.state.subtitles).toEqual([]);
  });
});
