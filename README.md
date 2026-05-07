# Watch Together

Synced video playback for any public URL. Create a room, share the link, paste
a video URL — play/pause/seek/mute are mirrored to everyone in the room.

Bun-powered WebSocket server + Vite/React/TypeScript frontend in a single repo.
The server serves the built frontend in production, so one process ships both.

## Stack

- **Server**: Bun HTTP + native WebSocket, in-memory room registry
- **Client**: React 18, Vite, TypeScript, Tailwind, shadcn-style primitives
- **Routing**: React Router (`/` for home, `/room/:id` for rooms)
- **No auth, no DB** — rooms live in server memory and are swept after 5 min idle

## Getting started

Requires [Bun](https://bun.sh) ≥ 1.3.

```bash
bun install
```

### Development (two processes)

```bash
bun run dev:server   # Bun WS server on :3000
bun run dev:client   # Vite dev server on :5173 (proxies /ws → :3000)
```

Open http://localhost:5173.

### Production (single process)

```bash
bun run build        # builds client/dist
bun run start        # Bun server serves client/dist + WebSocket on :3000
```

Open http://localhost:3000.

## How sync works

Server holds canonical per-room state: `{ videoUrl, playing, currentTime, muted, updatedAt }`.
Clients send intent messages (`play`, `pause`, `seek`, `setMuted`, `setUrl`) and
receive a `state` snapshot back. Late joiners get the snapshot on connect and
extrapolate `currentTime` forward using `updatedAt` + server clock skew.

Anyone in the room can drive playback. Last write wins.

### Echo guards

When remote state is applied to the `<video>` element, the resulting
`play`/`pause`/`seeked` events are ignored for a short window so they don't
get re-broadcast. `seek` only emits on the final `seeked` event, not during
scrubbing.

## Video sources

Anything the browser's `<video>` element can play directly — typically
`.mp4`/`.webm` served over HTTP(S) with range-request support. Cloudflare R2,
S3, Bunny CDN, archive.org, and most direct video URLs work great.

Google Drive is possible via `https://drive.google.com/uc?export=download&id=…`
but is **best-effort**: the virus-scan interstitial breaks files >~100MB and
Drive isn't designed as a video CDN. Prefer a real host if you can.

HLS/DASH manifests aren't supported in v1 (would need hls.js).

## Project layout

```
watch-together/
├── server/
│   ├── index.ts       # Bun.serve + WebSocket handler
│   ├── rooms.ts       # in-memory registry + TTL sweep
│   └── protocol.ts    # shared message types
└── client/
    ├── src/
    │   ├── pages/{Home,Room}.tsx
    │   ├── components/VideoPlayer.tsx
    │   ├── components/ui/{button,input,card}.tsx
    │   ├── hooks/useRoomSync.ts
    │   └── lib/utils.ts
    └── vite.config.ts
```

The client imports `server/protocol.ts` directly via the `@shared` path alias
so message types stay in one place.
