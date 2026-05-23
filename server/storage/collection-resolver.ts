import type { Collection, CollectionItem, CollectionSource } from "@/protocol.ts";
import type { Storage } from "@/storage/index.ts";
import { isMediaKey, listFolder, makeBucketClient, publicUrlForKey } from "@/storage/bucket.ts";

// Brief in-process cache for the live folder listing per collection. The
// folder lives on a remote bucket — listing on every read would mean a
// round-trip per Library card / per WS playback event. 30s is short
// enough that "I just deleted a file from the folder" feels current,
// long enough to avoid hammering the bucket.
const CACHE_TTL_MS = 30_000;
type CacheEntry = { items: CollectionItem[]; computedAt: number };
const cache = new Map<string, CacheEntry>();

// Clear cache. Called when a connection is mutated/removed (URLs may
// shift), when the collection itself is removed, or when a caller passes
// `?refresh=true`.
export function invalidateCollectionItems(collectionId?: string): void {
  if (collectionId) cache.delete(collectionId);
  else cache.clear();
}

// Returns the collection with its `items` filled in. For synced
// collections (`source != null`) the items are computed fresh from the
// bucket folder, with a short cache. For manual collections the stored
// items pass through unchanged.
export async function resolveCollection(collection: Collection, storage: Storage, options: { refresh?: boolean } = {}): Promise<Collection> {
  if (!collection.source) return collection;
  if (!options.refresh) {
    const cached = cache.get(collection.id);
    if (cached && Date.now() - cached.computedAt < CACHE_TTL_MS) {
      return { ...collection, items: cached.items };
    }
  }
  const items = await fetchFolderItems(collection.source, storage);
  cache.set(collection.id, { items, computedAt: Date.now() });
  return { ...collection, items };
}

async function fetchFolderItems(source: CollectionSource, storage: Storage): Promise<CollectionItem[]> {
  const conn = await storage.storageConnections.get(source.connectionId);
  if (!conn || !conn.publicBaseUrl) return [];
  const secret = await storage.storageConnections.getSecret(source.connectionId);
  if (!secret) return [];
  const client = makeBucketClient({ accountId: conn.accountId, accessKeyId: conn.accessKeyId, secretAccessKey: secret });
  try {
    const entries = await listFolder(client, conn.bucket, source.folderPrefix);
    // Same filter the client's "New collection from folder" used — media
    // only, sorted by key (alphabetical, like the file browser).
    const media = entries.filter((e) => isMediaKey(e.key)).sort((a, b) => a.key.localeCompare(b.key));
    return media.map((e) => ({
      url: publicUrlForKey(conn.publicBaseUrl!, e.key),
      name: e.key.slice(source.folderPrefix.length) || e.key,
    }));
  } catch (err) {
    console.error("[roomflix] sync folder list failed", source, err);
    return [];
  }
}
