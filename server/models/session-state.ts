import { Schema, model } from "mongoose";

// Persisted snapshot of a space's playback session. One doc per space
// (`_id = spaceId`). Mirrors the in-memory `Session.state` shape so a
// server restart or process replace doesn't lose what the room was
// watching. Restoring sets `playing` to false regardless of what the
// last snapshot said — viewers explicitly resume after a downtime so
// nobody gets surprise audio from a session they walked away from.
//
// Writes happen on every state mutation (debounced) plus a 2s
// heartbeat while playing, so the persisted `currentTime` stays within
// ~2s of truth when the process drops.

const subtitleSchema = new Schema(
  {
    id: { type: String, required: true },
    label: { type: String, required: true },
    lang: { type: String, default: null },
    url: { type: String, required: true },
  },
  { _id: false },
);

const sessionStateSchema = new Schema(
  {
    _id: { type: String, required: true },
    videoUrl: { type: String, default: null },
    videoTitle: { type: String, default: null },
    subtitles: { type: [subtitleSchema], default: [] },
    playing: { type: Boolean, default: false },
    currentTime: { type: Number, default: 0 },
    collectionId: { type: String, default: null },
    collectionIndex: { type: Number, default: 0 },
    collectionLoop: { type: Boolean, default: false },
    collectionShuffle: { type: Boolean, default: false },
    duration: { type: Number, default: null },
    updatedAt: { type: Number, required: true },
    updatedBy: { type: String, default: null },
    persistedAt: { type: Number, required: true },
  },
  { _id: false, versionKey: false, strict: true, minimize: false },
);

export const SessionStateModel = model("SessionState", sessionStateSchema, "session_state");
