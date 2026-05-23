import type { CollectionItem } from "@/protocol.ts";
import type { Storage } from "@/storage/index.ts";
import { AlbumModel, PlaylistModel } from "@/models/index.ts";

// One-shot boot migration: converts pre-unification playlists and albums
// into the unified `collections`. Idempotent — each legacy row is stamped
// `migratedAt` once converted, so a re-run skips it (and never clobbers a
// collection the user has since edited). Runs after runSpaceMigration so
// any legacy playlist already carries a real spaceId.
export async function runCollectionMigration(storage: Storage): Promise<void> {
  let migrated = 0;

  // Playlists store video IDs that reference Library entries — hydrate
  // each to an inline { url, name } item.
  const playlists = await PlaylistModel.find({ migratedAt: { $exists: false } }).lean();
  for (const pl of playlists) {
    const spaceId = pl.spaceId;
    if (typeof spaceId !== "string" || !spaceId) continue; // un-reparented legacy row
    const items: CollectionItem[] = [];
    for (const videoId of (pl.videoIds ?? []) as string[]) {
      const video = await storage.videos.get(spaceId, videoId);
      if (video) items.push({ url: video.url, name: video.title });
    }
    await storage.collections.create({
      spaceId,
      createdBy: (pl.createdBy as string) || spaceId,
      title: (pl.title as string) || "Untitled collection",
      items,
      source: null,
    });
    await PlaylistModel.updateOne({ _id: pl._id }, { $set: { migratedAt: Date.now() } });
    migrated++;
  }

  // Albums already store inline items — copy them straight across.
  const albums = await AlbumModel.find({ migratedAt: { $exists: false } }).lean();
  for (const al of albums) {
    const spaceId = al.spaceId;
    if (typeof spaceId !== "string" || !spaceId) continue;
    const items: CollectionItem[] = ((al.items ?? []) as Array<{ url?: unknown; name?: unknown }>)
      .filter((it) => typeof it?.url === "string" && it.url)
      .map((it) => ({ url: it.url as string, name: typeof it.name === "string" ? it.name : "" }));
    await storage.collections.create({
      spaceId,
      createdBy: (al.createdBy as string) || spaceId,
      title: (al.title as string) || "Untitled collection",
      items,
      source: null,
    });
    await AlbumModel.updateOne({ _id: al._id }, { $set: { migratedAt: Date.now() } });
    migrated++;
  }

  if (migrated > 0) {
    console.log(`[roomflix] collection migration: converted ${migrated} legacy playlist(s)/album(s)`);
  }
}
