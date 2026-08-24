import { createMongoStorage } from "@/storage/mongo.ts";
import type { Storage } from "@/storage/types.ts";

let cached: Storage | null = null;

// Sole entry point for storage. Connects to Mongo on first call and caches
// the result so all routers share one connection pool.
export async function createStorage(mongoUrl: string): Promise<Storage> {
  if (cached) return cached;
  cached = await createMongoStorage(mongoUrl);
  return cached;
}

export type { Storage, VideoRepo, TitleLibraryRepo, UserRepo, SessionRepo, StoredUser, Session } from "@/storage/types.ts";
