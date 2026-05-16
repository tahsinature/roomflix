import { Hono } from "hono";

import type { HealthStatus, LibraryHealth, VideoHealth } from "@/protocol.ts";
import { fetchProbe } from "@/probe.ts";
import type { Storage } from "@/storage/index.ts";
import { requireSpaceMember } from "@/auth.ts";

const TTL_MS = 5 * 60 * 1000;
const PROBE_CONCURRENCY = 10;

// Per-space cache. Each space has its own library, so the probe results
// can't be shared across spaces.
const cacheBySpace = new Map<string, LibraryHealth>();

// Reset whenever the catalog mutates (POST/PATCH/DELETE) so the next
// /api/library/health request rebuilds against the current set.
export function invalidateHealthCache(spaceId: string) {
  cacheBySpace.delete(spaceId);
}

// GET /api/library/health?refresh=true
//
// Probes every video URL and every subtitle URL in the caller's space
// library and returns a per-video, per-subtitle health snapshot. Cached
// 5 min server-side; pass ?refresh=true to bypass the cache.
export function buildHealthRouter(storage: Storage) {
  const app = new Hono();
  app.use("*", requireSpaceMember(storage));

  app.get("/", async (c) => {
    const spaceId = c.get("space").id;
    const refresh = c.req.query("refresh") === "true";
    const cached = cacheBySpace.get(spaceId);
    if (!refresh && cached && Date.now() - cached.checkedAt < TTL_MS) {
      return c.json(cached);
    }

    const videos = await storage.videos.list(spaceId);

    type Job = { videoId: string; kind: "video" | "subtitle"; subtitleId?: string; url: string };
    const jobs: Job[] = [];
    for (const v of videos) {
      jobs.push({ videoId: v.id, kind: "video", url: v.url });
      for (const s of v.subtitles) {
        jobs.push({ videoId: v.id, kind: "subtitle", subtitleId: s.id, url: s.url });
      }
    }

    const results = await mapWithConcurrency(jobs, PROBE_CONCURRENCY, (job) => probeUrl(job.url));

    const out: LibraryHealth = { checkedAt: Date.now(), videos: {} };
    for (const v of videos) out.videos[v.id] = { video: "unverified", subtitles: {} };
    for (let i = 0; i < jobs.length; i++) {
      const job = jobs[i]!;
      const status = results[i]!;
      const entry = out.videos[job.videoId] as VideoHealth;
      if (job.kind === "video") entry.video = status;
      else if (job.subtitleId) entry.subtitles[job.subtitleId] = status;
    }

    cacheBySpace.set(spaceId, out);
    return c.json(out);
  });

  return app;
}

async function probeUrl(url: string): Promise<HealthStatus> {
  const probe = await fetchProbe(url);
  switch (probe.kind) {
    case "ok":
      return "ok";
    case "head-disallowed":
      return "unverified";
    case "http-error":
    case "network-error":
      return "gone";
  }
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i]!);
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, worker);
  await Promise.all(workers);
  return results;
}
