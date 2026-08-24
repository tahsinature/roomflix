# Roomflix

Roomflix combines synchronized playback with personal movie discovery. Search
TMDB titles and people, keep an account-backed watchlist, inspect the Pulse Lab
prototype, then organize playable media into shared spaces and collections.

Bun-powered HTTP/WebSocket server + MongoDB + Vite/React/TypeScript frontend in
a single repo. The server serves the built frontend in production, so one
process ships both.

## Stack

- **Server**: Bun HTTP, Hono APIs + native WebSocket
- **Client**: React 18, Vite, TypeScript, Tailwind, shadcn-style primitives
- **Database**: MongoDB/Mongoose for accounts, spaces, personal discovery data,
  libraries, collections, chat, history, and session snapshots
- **Routing**: React Router (`/discover`, `/library`, `/watch`, settings and shares)
- **Authentication**: persistent accounts plus invite-based guest sessions

## Discovery configuration

The TMDB credential stays on the server:

```bash
TMDB_API_KEY=your-api-key
```

Discovery includes typo-tolerant search backed by a compact index generated
from TMDB's official daily exports, genre exploration, regional watch-provider
availability, trailers, and personal watchlist comparison. Refresh the bundled
index manually when needed:

```bash
bun run search-index:build
```

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

### Container / Kubernetes

```bash
docker build -t roomflix .
docker run --rm -p 3000:3000 roomflix
```

Multi-stage build: stage 1 installs deps and builds the client; stage 2 is a
~120 MB Alpine image with just `bun` + the server source + `client/dist`. No
runtime `node_modules` — the server uses Bun built-ins exclusively. Single
container, single port, single process.

Healthcheck: `GET /healthz`. For Kubernetes, point both `livenessProbe` and
`readinessProbe` at the same endpoint.

**Operational notes:**

- **MongoDB is required.** Account, space, library, discovery, collection,
  chat, history and playback snapshot data is durable.
- **Single replica for live sockets.** Current WebSocket connections live in
  one process; multiple replicas require sticky routing or a shared pub/sub
  layer. Persisted playback state is restored after a restart.

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
roomflix/
├── server/
│   ├── api/           # Hono REST routers
│   ├── data/          # generated TMDB fuzzy-search index
│   ├── discovery/     # typo-tolerant search ranking
│   ├── models/        # Mongoose schemas
│   ├── storage/       # repository interfaces + Mongo implementation
│   ├── index.ts       # Bun.serve + WebSocket handler
│   └── protocol.ts    # shared client/server types
└── client/
    ├── src/
    │   ├── pages/      # Discover, Library, Watch, Settings, …
    │   ├── features/discover/
    │   ├── components/player/
    │   ├── components/ui/{button,input,card}.tsx
    │   └── lib/api.ts
    └── vite.config.ts
```

The client imports `server/protocol.ts` directly via the `@shared` path alias
so message types stay in one place.
