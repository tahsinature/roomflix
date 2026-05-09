import type {
  HealthStatus,
  LibraryHealth,
  VideoHealth,
} from "../protocol.ts";
import { fetchProbe } from "../probe.ts";
import type { Storage } from "../storage/index.ts";

const TTL_MS = 5 * 60 * 1000;
const PROBE_CONCURRENCY = 10;

let cached: LibraryHealth | null = null;

// Called by the videos REST handler whenever the catalog mutates so the
// next health request rebuilds against the current set of videos/subtitles.
export function invalidateHealthCache() {
  cached = null;
}

export async function handleHealthRest(
  req: Request,
  url: URL,
  storage: Storage,
): Promise<Response> {
  if (req.method !== "GET") {
    return json({ error: "method not allowed" }, 405);
  }

  const refresh = url.searchParams.get("refresh") === "true";
  if (!refresh && cached && Date.now() - cached.checkedAt < TTL_MS) {
    return json(cached);
  }

  const videos = await storage.videos.list();
  // Flatten every URL into one job list so we can pace concurrency across
  // the whole library rather than per-video.
  type Job = {
    videoId: string;
    kind: "video" | "subtitle";
    subtitleId?: string;
    url: string;
  };
  const jobs: Job[] = [];
  for (const v of videos) {
    jobs.push({ videoId: v.id, kind: "video", url: v.url });
    for (const s of v.subtitles) {
      jobs.push({
        videoId: v.id,
        kind: "subtitle",
        subtitleId: s.id,
        url: s.url,
      });
    }
  }

  const results = await mapWithConcurrency(jobs, PROBE_CONCURRENCY, (job) =>
    probeUrl(job.url),
  );

  const out: LibraryHealth = {
    checkedAt: Date.now(),
    videos: {},
  };
  for (const v of videos) {
    out.videos[v.id] = { video: "unverified", subtitles: {} };
  }
  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i]!;
    const status = results[i]!;
    const entry = out.videos[job.videoId] as VideoHealth;
    if (job.kind === "video") {
      entry.video = status;
    } else if (job.subtitleId) {
      entry.subtitles[job.subtitleId] = status;
    }
  }

  cached = out;
  return json(out);
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

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i]!);
    }
  }
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    worker,
  );
  await Promise.all(workers);
  return results;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
