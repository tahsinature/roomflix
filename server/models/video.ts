import { Schema, model } from "mongoose";

// Library video entry. Belongs to a space; the (spaceId, url) pair is
// the natural uniqueness key so the API can be idempotent on add.

const subtitleSchema = new Schema(
  {
    id: { type: String, required: true },
    url: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
    lang: { type: String, default: "", trim: true },
  },
  { _id: false },
);

const videoSchema = new Schema(
  {
    _id: { type: String, required: true },
    spaceId: { type: String, required: true, index: true },
    addedBy: { type: String, required: true },
    url: { type: String, required: true, trim: true },
    title: { type: String, required: true },
    subtitles: { type: [subtitleSchema], default: [] },
    addedAt: { type: Number, required: true },
    updatedAt: { type: Number, required: true },
    // Legacy column from the pre-spaces schema; the boot reparent
    // migration sweeps these into spaceId. Kept on the schema only so
    // the reparent updateMany can match + $unset it without strict-mode
    // complaints.
    ownerId: { type: String },
  },
  { _id: false, versionKey: false, strict: true, minimize: false },
);

// Sparse so legacy rows with no `url` don't collide on the composite key.
videoSchema.index({ spaceId: 1, url: 1 }, { unique: true, sparse: true });

export const VideoModel = model("Video", videoSchema, "videos");
export type VideoDoc = ReturnType<typeof VideoModel["hydrate"]>;
