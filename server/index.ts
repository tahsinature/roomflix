import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ServerWebSocket } from "bun";
import { Hono } from "hono";

import { type ClientMessage, type ServerMessage } from "@/protocol.ts";
import { getOrCreateRoom, removeSocket, type WsData } from "@/rooms.ts";
import { createStorage } from "@/storage/index.ts";
import { buildVideosRouter } from "@/api/videos.ts";
import { buildRoomsRouter } from "@/api/rooms.ts";
import { buildHealthRouter } from "@/api/health.ts";
import { buildProbeRouter } from "@/api/probe.ts";
import { buildLibraryImportRouter } from "@/api/library_import.ts";
import { buildSubtitleProxyRouter } from "@/api/subtitle_proxy.ts";

const PORT = Number(process.env.PORT ?? 3000);
const IS_PROD = process.env.NODE_ENV === "production";

const CLIENT_DIST = join(import.meta.dir, "..", "client", "dist");
const HAS_CLIENT_BUILD = existsSync(CLIENT_DIST);

const storage = createStorage();

// HTTP routes via Hono. The WebSocket /ws path is handled separately in
// Bun.serve below — Hono doesn't own WS upgrades for our pattern (we need
// per-room socket bookkeeping that lives outside any framework).
const app = new Hono();

app.get("/healthz", (c) => c.text("ok"));

app.route("/api/videos", buildVideosRouter(storage));
app.route("/api/rooms", buildRoomsRouter(storage));
app.route("/api/library/health", buildHealthRouter(storage));
app.route("/api/library/probe", buildProbeRouter());
app.route("/api/library/import", buildLibraryImportRouter(storage));
app.route("/api/library/subtitle", buildSubtitleProxyRouter());

// SPA fallback: in prod, serve the Vite build for any unmatched path. In
// dev the Vite server handles the UI and proxies /ws + /api here.
app.all("*", async (c) => {
  if (!HAS_CLIENT_BUILD) {
    return c.text("roomflix server running. Start the Vite dev server for the UI.");
  }
  const path = c.req.path === "/" ? "/index.html" : c.req.path;
  const file = Bun.file(join(CLIENT_DIST, path));
  if (await file.exists()) return new Response(file);
  // Unknown route → return index.html so React Router can resolve it.
  return new Response(Bun.file(join(CLIENT_DIST, "index.html")));
});

function broadcastState(roomId: string) {
  const room = getOrCreateRoom(roomId);
  const message: ServerMessage = { type: "state", state: room.state, viewers: room.sockets.size, serverTime: Date.now() };
  const payload = JSON.stringify(message);
  for (const ws of room.sockets) ws.send(payload);
}

function broadcastViewers(roomId: string) {
  const room = getOrCreateRoom(roomId);
  const payload = JSON.stringify({ type: "viewers", viewers: room.sockets.size } satisfies ServerMessage);
  for (const ws of room.sockets) ws.send(payload);
}

async function handleClientMessage(ws: ServerWebSocket<WsData>, message: ClientMessage) {
  const room = getOrCreateRoom(ws.data.roomId);
  const now = Date.now();

  switch (message.type) {
    case "hello":
      // Client already sent hello on connect; no-op, state was pushed on open.
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
  fetch(req, srv) {
    const url = new URL(req.url);

    // WebSocket upgrade: /ws?room=<id>&client=<id>. Handled before Hono
    // because srv.upgrade() needs the raw Bun server reference.
    if (url.pathname === "/ws") {
      const roomId = url.searchParams.get("room");
      const clientId = url.searchParams.get("client");
      if (!roomId || !clientId) return new Response("missing room or client", { status: 400 });
      const ok = srv.upgrade(req, { data: { roomId, clientId } });
      return ok ? undefined : new Response("upgrade failed", { status: 500 });
    }

    return app.fetch(req);
  },
  websocket: {
    open(ws) {
      const room = getOrCreateRoom(ws.data.roomId);
      room.sockets.add(ws);
      const snapshot: ServerMessage = { type: "state", state: room.state, viewers: room.sockets.size, serverTime: Date.now() };
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
  `[roomflix] ${IS_PROD ? "prod" : "dev"} server on http://localhost:${server.port}` + (HAS_CLIENT_BUILD ? " (serving client/dist)" : " (no client build; use Vite dev server)"),
);
