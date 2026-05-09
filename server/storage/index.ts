import { InMemoryVideoRepo } from "@/storage/memory.ts";
import type { Storage } from "@/storage/types.ts";

let cached: Storage | null = null;

// Sole entry point for storage. When a DB is wired in, this is the only
// place that needs to change — branch on env (e.g. DATABASE_URL) and
// return the DB-backed impls instead.
export function createStorage(): Storage {
  if (cached) return cached;
  cached = { videos: new InMemoryVideoRepo() };
  return cached;
}

export type { Storage, VideoRepo } from "@/storage/types.ts";
