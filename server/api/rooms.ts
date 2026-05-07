import type { RoomListItem } from "../protocol.ts";
import { listRooms } from "../rooms.ts";
import type { Storage } from "../storage/index.ts";

export async function handleRoomsRest(
  req: Request,
  url: URL,
  storage: Storage,
): Promise<Response> {
  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "method not allowed" }), {
      status: 405,
      headers: { "content-type": "application/json" },
    });
  }

  const includeEmpty = url.searchParams.get("include") === "all";
  const rooms = listRooms({ includeEmpty });
  const items: RoomListItem[] = await Promise.all(
    rooms.map(async (r) => {
      let video: RoomListItem["video"] = null;
      if (r.state.videoUrl) {
        const entry = await storage.videos.findByUrl(r.state.videoUrl);
        video = {
          url: r.state.videoUrl,
          title: entry?.title ?? r.state.videoUrl,
        };
      }
      return {
        id: r.id,
        viewers: r.viewers,
        video,
        updatedAt: r.state.updatedAt,
      };
    }),
  );

  return new Response(JSON.stringify(items), {
    headers: { "content-type": "application/json" },
  });
}
