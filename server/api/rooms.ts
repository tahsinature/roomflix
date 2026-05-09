import { Hono } from "hono";

import type { RoomListItem } from "@/protocol.ts";
import { listRooms } from "@/rooms.ts";
import type { Storage } from "@/storage/index.ts";

// GET /api/rooms?include=all
//
// Lists currently-occupied rooms. With ?include=all also returns rooms
// in their grace period (zero viewers, awaiting sweep).
export function buildRoomsRouter(storage: Storage) {
  const app = new Hono();

  app.get("/", async (c) => {
    const includeEmpty = c.req.query("include") === "all";
    const rooms = listRooms({ includeEmpty });

    const items: RoomListItem[] = await Promise.all(
      rooms.map(async (r) => {
        let video: RoomListItem["video"] = null;
        if (r.state.videoUrl) {
          const entry = await storage.videos.findByUrl(r.state.videoUrl);
          video = { url: r.state.videoUrl, title: entry?.title ?? r.state.videoUrl };
        }
        return { id: r.id, viewers: r.viewers, video, updatedAt: r.state.updatedAt };
      }),
    );
    return c.json(items);
  });

  return app;
}
