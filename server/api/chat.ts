import { Hono } from "hono";

import type { Storage } from "@/storage/index.ts";
import { requireSpaceMember } from "@/auth.ts";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

// History endpoint for persistent chat. Live messages still travel over
// the WS — this is just for a remote (or freshly opened tab) that needs
// to backfill what was said before it joined.
//   GET /api/spaces/:id/chat?limit=N  → ChatMessage[] (oldest → newest)
export function buildChatRouter(storage: Storage) {
  const app = new Hono();
  app.use("*", requireSpaceMember(storage));

  app.get("/", async (c) => {
    const raw = Number(c.req.query("limit") ?? DEFAULT_LIMIT);
    const limit = Math.min(MAX_LIMIT, Math.max(1, Number.isFinite(raw) ? raw : DEFAULT_LIMIT));
    const messages = await storage.chat.listForSpace(c.get("space").id, limit);
    return c.json(messages);
  });

  return app;
}
