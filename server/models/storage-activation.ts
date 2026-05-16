import { Schema, model } from "mongoose";

// Marker row: "connection X is exposed in space Y". The composite
// `<connectionId>:<spaceId>` is the _id so the natural uniqueness
// constraint is just unique-_id (no extra index needed).
const storageActivationSchema = new Schema(
  {
    _id: { type: String, required: true },
    connectionId: { type: String, required: true, index: true },
    spaceId: { type: String, required: true, index: true },
    activatedAt: { type: Number, required: true },
    // Legacy rows that pre-dated this field default to false in the
    // wire converter.
    openToGuests: { type: Boolean, default: false },
  },
  { _id: false, versionKey: false, strict: true, minimize: false },
);

export const StorageActivationModel = model(
  "StorageActivation",
  storageActivationSchema,
  "storage_activations",
);
