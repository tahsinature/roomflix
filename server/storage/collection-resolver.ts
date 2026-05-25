import type { Collection, CollectionItem, CollectionMediaFilter, CollectionSource } from "@/protocol.ts";
import type { Storage } from "@/storage/index.ts";
import { isMediaKey, listFolder, makeBucketClient, mediaKindOfKey, publicUrlForKey } from "@/storage/bucket.ts";

// Brief in-process cache for the live folder listing per collection. The
// folder lives on a remote bucket — listing on every read would mean a
// round-trip per Library card / per WS playback event. 30s is short
// enough that "I just deleted a file from the folder" feels current,
// long enough to avoid hammering the bucket.
// We cache the UNFILTERED listing — the saved mediaFilter is applied
// after the cache lookup, so changing the filter takes effect
// immediately without a cache-bust round trip.
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
//
// `unfiltered` bypasses the saved mediaFilter — used by the
// "Show filtered" view on CollectionEdit + the /watch panel override
// so the user can see what's being hidden. The default path applies
// the filter so the items array returned IS the canonical play list
// — never two viewers seeing different items for the same collection
// in a room.
export async function resolveCollection(
  collection: Collection,
  storage: Storage,
  options: { refresh?: boolean; unfiltered?: boolean } = {},
): Promise<Collection> {
  if (!collection.source) return collection;
  let items: CollectionItem[];
  if (!options.refresh) {
    const cached = cache.get(collection.id);
    if (cached && Date.now() - cached.computedAt < CACHE_TTL_MS) {
      items = cached.items;
    } else {
      items = await fetchFolderItems(collection.source, storage);
      cache.set(collection.id, { items, computedAt: Date.now() });
    }
  } else {
    items = await fetchFolderItems(collection.source, storage);
    cache.set(collection.id, { items, computedAt: Date.now() });
  }
  const filtered = options.unfiltered ? items : applyMediaFilter(items, collection.mediaFilter);
  return { ...collection, items: filtered };
}

// Drops items whose kind isn't in the filter. Null/empty filters and
// all-kinds filters are no-ops (the saver also collapses those to
// null, but the resolver guards anyway so a hand-edited DB row can't
// surprise anyone). Kind classification uses the same logic the
// client uses on URLs.
function applyMediaFilter(items: CollectionItem[], filter: CollectionMediaFilter | null): CollectionItem[] {
  if (!filter || filter.kinds.length === 0) return items;
  const allow = new Set(filter.kinds);
  if (allow.size >= 3) return items;
  return items.filter((it) => {
    const k = mediaKindOfKey(it.url);
    return k !== null && allow.has(k);
  });
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
