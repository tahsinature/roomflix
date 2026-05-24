import { Schema, model } from "mongoose";

// One row per "loaded item" in the room. Opened when the playback URL
// changes (setUrl / collection item swap / jumpTo), closed when the
// URL changes again or the player reports videoEnded. `lastPosition`
// is updated by the 2s persist heartbeat while playing, so a row that
// never got an explicit close still reflects how far the room got.
//
// History is space-scoped (the session is shared across viewers) and
// captures snapshots of the item — title, duration, collection
// context — so the timeline still reads correctly even if the source
// is later removed from the library or the collection.

const watchHistorySchema = new Schema(
  {
    _id: { type: String, required: true },
    spaceId: { type: String, required: true, index: true },
    videoUrl: { type: String, required: true },
    videoTitle: { type: String, default: null },
    collectionId: { type: String, default: null },
    collectionTitle: { type: String, default: null },
    collectionIndex: { type: Number, default: null },
    duration: { type: Number, default: null },
    startedAt: { type: Number, required: true },
    endedAt: { type: Number, default: null },
    lastPosition: { type: Number, default: 0 },
    completed: { type: Boolean, default: false },
  },
  { _id: false, versionKey: false, strict: true, minimize: false },
);

// (space, startedAt DESC) is the access pattern for the /history page.
watchHistorySchema.index({ spaceId: 1, startedAt: -1 });

export const WatchHistoryModel = model("WatchHistory", watchHistorySchema, "watch_history");
