import { Schema, model } from "mongoose";

// Collection — an ordered, mixed-media list (videos / audio / photos).
// Items are stored inline (not Library refs), so a folder of hundreds of
// files lands as a single document. Replaces the legacy playlists +
// albums collections; migrate-collections.ts converts any pre-existing
// rows on boot.

const collectionItemSchema = new Schema(
  {
    url: { type: String, required: true, trim: true },
    name: { type: String, default: "" },
  },
  { _id: false },
);

const collectionSchema = new Schema(
  {
    _id: { type: String, required: true },
    spaceId: { type: String, required: true },
    createdBy: { type: String, required: true },
    title: { type: String, required: true },
    items: { type: [collectionItemSchema], default: [] },
    createdAt: { type: Number, required: true },
    updatedAt: { type: Number, required: true },
  },
  { _id: false, versionKey: false, strict: true, minimize: false },
);

collectionSchema.index({ spaceId: 1, createdAt: -1 });

export const CollectionModel = model("Collection", collectionSchema, "collections");
