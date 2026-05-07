import type { ServerWebSocket } from "bun";
import { emptyRoomState, type RoomState } from "./protocol.ts";

export type WsData = { roomId: string; clientId: string };

type Room = {
  id: string;
  state: RoomState;
  sockets: Set<ServerWebSocket<WsData>>;
  // Timer that deletes the room after it has been empty for a grace period.
  emptySince: number | null;
};

const rooms = new Map<string, Room>();
const EMPTY_ROOM_TTL_MS = 5 * 60 * 1000;

export function getOrCreateRoom(id: string): Room {
  let room = rooms.get(id);
  if (!room) {
    room = { id, state: emptyRoomState(), sockets: new Set(), emptySince: null };
    rooms.set(id, room);
  }
  room.emptySince = null;
  return room;
}

export function getRoom(id: string): Room | undefined {
  return rooms.get(id);
}

// Snapshot of rooms. By default skips rooms with no live sockets (those are
// in the pre-sweep grace period). Pass `includeEmpty: true` to include them.
export function listRooms(
  opts: { includeEmpty?: boolean } = {},
): { id: string; viewers: number; state: Room["state"] }[] {
  const out: { id: string; viewers: number; state: Room["state"] }[] = [];
  for (const room of rooms.values()) {
    if (opts.includeEmpty || room.sockets.size > 0) {
      out.push({ id: room.id, viewers: room.sockets.size, state: room.state });
    }
  }
  return out;
}

export function removeSocket(room: Room, ws: ServerWebSocket<WsData>) {
  room.sockets.delete(ws);
  if (room.sockets.size === 0) {
    room.emptySince = Date.now();
  }
}

// Called periodically to clean up rooms that have been empty past the TTL.
export function sweepEmptyRooms() {
  const now = Date.now();
  for (const [id, room] of rooms) {
    if (room.sockets.size === 0 && room.emptySince && now - room.emptySince > EMPTY_ROOM_TTL_MS) {
      rooms.delete(id);
    }
  }
}

setInterval(sweepEmptyRooms, 60_000);
