# syntax=docker/dockerfile:1.7

# ─── Stage 1: install deps + build the client ──────────────
FROM oven/bun:1.3-alpine AS builder

WORKDIR /app

# Manifests first so dependency-only changes invalidate fewer layers.
COPY package.json bun.lock ./
COPY client/package.json ./client/
COPY server/package.json ./server/

RUN bun install --frozen-lockfile

# Source. tsconfig.base.json is referenced by both workspaces.
COPY tsconfig.base.json ./
COPY client ./client
COPY server ./server

RUN bun run build

# ─── Stage 2: minimal runtime ───────────────────────────────
FROM oven/bun:1.3-alpine AS runtime

WORKDIR /app

# Server has no runtime deps — it uses Bun built-ins (Bun.serve, Bun.file).
# So we copy only source + the built client; no node_modules.
COPY --from=builder /app/server ./server
COPY --from=builder /app/client/dist ./client/dist

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# wget ships in the alpine bun image. /healthz is exposed by the server.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:3000/healthz || exit 1

# Server resolves client/dist via import.meta.dir → ../client/dist, so
# running from /app keeps that lookup correct.
CMD ["bun", "run", "server/index.ts"]
