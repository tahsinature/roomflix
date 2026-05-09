import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ServerWebSocket } from "bun";
import {
  type ClientMessage,
  type ServerMessage,
} from "./protocol.ts";
import { getOrCreateRoom, removeSocket, type WsData } from "./rooms.ts";
import { createStorage } from "./storage/index.ts";
import { handleVideosRest } from "./api/videos.ts";
import { handleRoomsRest } from "./api/rooms.ts";
import { handleHealthRest } from "./api/health.ts";
import { handleProbeRest } from "./api/probe.ts";

const PORT = Number(process.env.PORT ?? 3000);
const IS_PROD = process.env.NODE_ENV === "production";

const CLIENT_DIST = join(import.meta.dir, "..", "client", "dist");
const HAS_CLIENT_BUILD = existsSync(CLIENT_DIST);

const storage = createStorage();

function broadcastState(roomId: string) {
  const room = getOrCreateRoom(roomId);
  const message: ServerMessage = {
    type: "state",
    state: room.state,
    viewers: room.sockets.size,
    serverTime: Date.now(),
  };
  const payload = JSON.stringify(message);
  for (const ws of room.sockets) ws.send(payload);
}

function broadcastViewers(roomId: string) {
  const room = getOrCreateRoom(roomId);
  const message: ServerMessage = { type: "viewers", viewers: room.sockets.size };
  const payload = JSON.stringify(message);
  for (const ws of room.sockets) ws.send(payload);
}

async function handleClientMessage(
  ws: ServerWebSocket<WsData>,
  message: ClientMessage,
) {
  const room = getOrCreateRoom(ws.data.roomId);
  const now = Date.now();

  switch (message.type) {
    case "hello":
      // Client already sent hello on connect; no-op, state is pushed on open.
      return;
    case "play":
      room.state.playing = true;
      room.state.currentTime = message.currentTime;
      break;
    case "pause":
      room.state.playing = false;
      room.state.currentTime = message.currentTime;
      break;
    case "seek":
      room.state.currentTime = message.currentTime;
      break;
    case "setMuted":
      room.state.muted = message.muted;
      break;
    case "setUrl":
      room.state.videoUrl = message.videoUrl;
      room.state.currentTime = 0;
      room.state.playing = false;
      // Auto-save (idempotent on URL) and snapshot the library entry's
      // subtitles into room state. Errors here shouldn't block playback.
      try {
        const entry = await storage.videos.create({ url: message.videoUrl });
        room.state.subtitles = entry.subtitles;
      } catch (err) {
        console.error("[roomflix] library lookup failed", err);
        room.state.subtitles = [];
      }
      break;
  }

  room.state.updatedAt = now;
  room.state.updatedBy = ws.data.clientId;
  broadcastState(ws.data.roomId);
}

const server = Bun.serve<WsData>({
  port: PORT,
  async fetch(req, srv) {
    const url = new URL(req.url);

    // WebSocket upgrade: /ws?room=<id>&client=<id>
    if (url.pathname === "/ws") {
      const roomId = url.searchParams.get("room");
      const clientId = url.searchParams.get("client");
      if (!roomId || !clientId) {
        return new Response("missing room or client", { status: 400 });
      }
      const ok = srv.upgrade(req, { data: { roomId, clientId } });
      if (ok) return;
      return new Response("upgrade failed", { status: 500 });
    }

    if (url.pathname === "/healthz") {
      return new Response("ok");
    }

    if (url.pathname === "/api/videos" || url.pathname.startsWith("/api/videos/")) {
      return handleVideosRest(req, url, storage);
    }

    if (url.pathname === "/api/rooms") {
      return handleRoomsRest(req, url, storage);
    }

    if (url.pathname === "/api/library/health") {
      return handleHealthRest(req, url, storage);
    }

    if (url.pathname === "/api/library/probe") {
      return handleProbeRest(req);
    }

    // In prod, serve the Vite build. In dev, Vite serves the frontend directly
    // and proxies /ws here — so a hit to any other path here is unexpected.
    if (HAS_CLIENT_BUILD) {
      const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
      const filePath = join(CLIENT_DIST, pathname);
      const file = Bun.file(filePath);
      if (await file.exists()) return new Response(file);
      // SPA fallback: unknown routes return index.html so React Router works.
      return new Response(Bun.file(join(CLIENT_DIST, "index.html")));
    }

    return new Response(
      "roomflix server running. Start the Vite dev server for the UI.",
      { status: 200 },
    );
  },
  websocket: {
    open(ws) {
      const room = getOrCreateRoom(ws.data.roomId);
      room.sockets.add(ws);
      const snapshot: ServerMessage = {
        type: "state",
        state: room.state,
        viewers: room.sockets.size,
        serverTime: Date.now(),
      };
      ws.send(JSON.stringify(snapshot));
      broadcastViewers(ws.data.roomId);
    },
    async message(ws, raw) {
      if (typeof raw !== "string") return;
      let parsed: ClientMessage;
      try {
        parsed = JSON.parse(raw) as ClientMessage;
      } catch {
        return;
      }
      await handleClientMessage(ws, parsed);
    },
    close(ws) {
      const room = getOrCreateRoom(ws.data.roomId);
      removeSocket(room, ws);
      broadcastViewers(ws.data.roomId);
    },
  },
});

console.log(
  `[roomflix] ${IS_PROD ? "prod" : "dev"} server on http://localhost:${server.port}` +
    (HAS_CLIENT_BUILD ? " (serving client/dist)" : " (no client build; use Vite dev server)"),
);
