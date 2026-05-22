import { Schema, model } from "mongoose";

// LEGACY — albums were merged into the unified Collection model. This
// schema is kept alive only so the boot migration (migrate-collections.ts)
// can read pre-existing rows and convert them. No new code should touch it.

const albumItemSchema = new Schema(
  {
    url: { type: String, required: true, trim: true },
    name: { type: String, default: "" },
  },
  { _id: false },
);

const albumSchema = new Schema(
  {
    _id: { type: String, required: true },
    spaceId: { type: String, required: true },
    createdBy: { type: String, required: true },
    title: { type: String, required: true },
    items: { type: [albumItemSchema], default: [] },
    sourceConnectionId: { type: String },
    sourceFolderPrefix: { type: String },
    createdAt: { type: Number, required: true },
    updatedAt: { type: Number, required: true },
    // Stamped by the Collection migration once this row has been
    // converted, so a re-run skips it.
    migratedAt: { type: Number },
  },
  { _id: false, versionKey: false, strict: true, minimize: false },
);

albumSchema.index({ spaceId: 1, createdAt: -1 });

export const AlbumModel = model("Album", albumSchema, "albums");
