import { Schema, model } from "mongoose";

// Ordered playlist of library video IDs. We store ids rather than
// embedding videos so a playlist stays in sync with library edits — the
// API hydrates ids at read time.
const playlistSchema = new Schema(
  {
    _id: { type: String, required: true },
    spaceId: { type: String, required: true },
    createdBy: { type: String, required: true },
    title: { type: String, required: true },
    videoIds: { type: [String], default: [] },
    createdAt: { type: Number, required: true },
    updatedAt: { type: Number, required: true },
    // Legacy from pre-spaces schema (see VideoModel for the same
    // pattern); only the boot reparent migration touches it.
    ownerId: { type: String },
  },
  { _id: false, versionKey: false, strict: true, minimize: false },
);

playlistSchema.index({ spaceId: 1, createdAt: -1 });

export const PlaylistModel = model("Playlist", playlistSchema, "playlists");
