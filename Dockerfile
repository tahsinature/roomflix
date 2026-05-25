# syntax=docker/dockerfile:1.7

# ─── Stage 0: shared base ──────────────────────────────────────────
# Nothing system-level here yet — the prior yt-dlp + ffmpeg deps were
# only used by the (now-removed) YouTube import pipeline. Stage kept so
# downstream stages can extend it cheaply without restructuring.
FROM oven/bun:1.3-alpine AS base

# ─── Dev stage: workspace deps installed, source bind-mounted at runtime ─
# Compose's `dev` profile uses this target. The actual source comes in as
# a bind mount at /app, with named volumes masking node_modules so the
# container's install isn't shadowed by a (possibly Mac-arch) host one.
FROM base AS dev
WORKDIR /app
# tini for sane signal handling in dev too — Ctrl-C should kill bun.
RUN apk add --no-cache tini
ENTRYPOINT ["/sbin/tini", "--"]

# ─── Stage 1: install deps + build the client ──────────────
FROM base AS builder

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
FROM base AS runtime

# tini as PID 1 so SIGINT/SIGTERM (Ctrl-C, k8s shutdown) actually reach Bun.
# Without an init, the kernel masks default signal actions on PID 1 and the
# container would have to be SIGKILLed after Docker's grace period.
#
# curl + gnupg are required by the Doppler installer (signature
# verification). They stay in the image because the install runs at
# build time only; runtime doesn't reuse them.
RUN apk add --no-cache tini curl gnupg

WORKDIR /app

# Scripts first so the Doppler install can run before app code is
# copied — keeps that layer cached when only app code changes.
COPY scripts ./scripts
# Belt-and-braces: COPY preserves modes, but git checkouts on some
# platforms (e.g. CI under Windows) lose +x. Re-apply.
RUN chmod +x scripts/*.sh && ./scripts/install-doppler-inside-container.sh

# Workspace root needs node_modules (Bun hoists deps here) plus the server
# source. Hono is the only runtime dep right now; the rest is Bun built-ins.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/server ./server
COPY --from=builder /app/client/dist ./client/dist

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# wget ships in the alpine bun image. /healthz is exposed by the server.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:3000/healthz || exit 1

# tini becomes PID 1 and execs the run-prod.sh wrapper, which pulls
# secrets from Doppler into .env then execs the bun server. Server
# resolves client/dist via import.meta.dir → ../client/dist, so /app
# keeps that right.
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["./scripts/run-prod.sh"]
