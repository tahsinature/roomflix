import { Hono } from "hono";

import type { SessionStateSnapshot } from "@/protocol.ts";
import type { Storage } from "@/storage/index.ts";
import { requireSpaceMember } from "@/auth.ts";
import { getSession, viewersOf } from "@/sessions.ts";

// GET /api/session/state
//
// Lightweight read-only view of the in-memory playback session for the
// caller's current space. Pages render a "currently playing" indicator
// without opening a full WS (which would inflate the viewer count).
//
// Returns 200 with null body when nothing is playing (no session yet, or
// session exists but has no videoUrl).
export function buildSessionStateRouter(storage: Storage) {
  const app = new Hono();
  app.use("*", requireSpaceMember(storage));

  app.get("/", (c) => {
    const session = getSession(c.get("space").id);
    if (!session) return c.json(null);
    const snapshot: SessionStateSnapshot = {
      videoUrl: session.state.videoUrl,
      videoTitle: session.state.videoTitle,
      playing: session.state.playing,
      viewers: viewersOf(session),
      playlistId: session.state.playlistId,
    };
    return c.json(snapshot);
  });

  return app;
}

// GET /api/session/members — directory of everyone with persistent
// membership in the caller's current space. Used by the presence
// dropdown to show "all members + which are online right now". Guests
// are intentionally not in this list (they're transient and surface via
// the viewers feed when connected).
export function buildSessionMembersRouter(storage: Storage) {
  const app = new Hono();
  app.use("*", requireSpaceMember(storage));

  app.get("/", async (c) => {
    const space = c.get("space");
    const members = await storage.memberships.listForSpace(space.id);
    return c.json(members);
  });

  return app;
}
