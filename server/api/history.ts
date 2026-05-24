import { Hono } from "hono";
import type { Storage } from "@/storage/index.ts";
import { requireSpaceMember, requireSpaceOwner } from "@/auth.ts";
import { clearActiveHistoryEntry } from "@/sessions.ts";

// GET    /api/spaces/:id/history?limit=NN  — newest-first timeline
// DELETE /api/spaces/:id/history           — owner-only bulk wipe
//
// Both gated to space membership; the destructive op is additionally
// gated to the owner since history is a shared artifact and any
// member shouldn't be able to nuke it.
export function buildWatchHistoryRouter(storage: Storage) {
  const app = new Hono();
  app.use("*", requireSpaceMember(storage));

  app.get("/", async (c) => {
    const raw = c.req.query("limit");
    const limit = Math.min(200, Math.max(1, parseInt(raw ?? "100", 10) || 100));
    const entries = await storage.watchHistory.listForSpace(c.get("space").id, limit);
    return c.json(entries);
  });

  app.delete("/", requireSpaceOwner(), async (c) => {
    const spaceId = c.get("space").id;
    const deleted = await storage.watchHistory.removeAllForSpace(spaceId);
    // The in-memory active-row pointer now references a deleted doc;
    // clear it so the next URL change opens a fresh row.
    clearActiveHistoryEntry(spaceId);
    return c.json({ deleted });
  });

  return app;
}
