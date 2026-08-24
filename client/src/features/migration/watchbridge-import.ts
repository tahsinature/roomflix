export function readWatchBridgeLibrary(raw: unknown): unknown[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("That isn't a WatchBridge backup file.");
  }
  const record = raw as Record<string, unknown>;
  if (record.app !== "watchbridge") {
    throw new Error("That isn't a WatchBridge backup file.");
  }
  const data = record.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("The backup has no data section.");
  }
  const library = (data as Record<string, unknown>).library;
  if (!Array.isArray(library)) {
    throw new Error("The backup doesn't contain a title library.");
  }

  // Only title records cross the boundary. Browser settings, custom actions,
  // recent searches and API credentials are intentionally excluded.
  return library.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return item;
    const source = item as Record<string, unknown>;
    return { ...source, tmdbId: source.id };
  });
}
