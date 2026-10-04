import type { DiscoverMediaType } from "@/protocol.ts";
import { tmdbRequest } from "./tmdb-client.ts";
import { createPersistentCache } from "./persistent-cache.ts";

const persistent = createPersistentCache<string | null>("imdb-identity");
const pending = new Map<string, Promise<string | null>>();
const cache = new Map<string, { data: string | null; expiresAt: number }>();

export function resolveImdbIdentity(mediaType: DiscoverMediaType, tmdbId: number): Promise<string | null> {
  const key = `${mediaType}:${tmdbId}`;
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.data);
  const existing = pending.get(key);
  if (existing) return existing;
  const promise = (async () => {
    const stored = await persistent.get(key).catch(() => null);
    if (stored) {
      cache.set(key, stored);
      return stored.data;
    }
    const result = await tmdbRequest<{ imdb_id?: string | null }>(`/${mediaType}/${tmdbId}/external_ids`);
    const data = result.imdb_id && /^tt\d{7,10}$/.test(result.imdb_id) ? result.imdb_id : null;
    const expiresAt = Date.now() + (data ? 30 * 24 : 1) * 60 * 60 * 1000;
    if (cache.size >= 2000) cache.delete(cache.keys().next().value!);
    cache.set(key, { data, expiresAt });
    await persistent.set(key, data, expiresAt).catch(() => undefined);
    return data;
  })().finally(() => pending.delete(key));
  pending.set(key, promise);
  return promise;
}
