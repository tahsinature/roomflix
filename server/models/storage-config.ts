import { Schema, model } from "mongoose";

// DEPRECATED — legacy `storage_configs` collection. Only the boot
// migration reads from this; after each row is replicated into the new
// storage_connections + storage_activations rows it's stamped with
// `migratedAt` so a re-run is a no-op. Kept in tree purely so the
// migration code still has a model to talk to; nothing else should
// reference it.
const storageConfigSchema = new Schema(
  {
    _id: { type: String, required: true }, // spaceId
    provider: { type: String, required: true, enum: ["r2"] },
    accountId: { type: String, required: true },
    bucket: { type: String, required: true },
    accessKeyId: { type: String, required: true },
    secretAccessKeyEnc: { type: String, required: true },
    publicBaseUrl: { type: String },
    maxBytes: { type: Number, required: true },
    label: { type: String },
    updatedAt: { type: Number, required: true },
    migratedAt: { type: Number },
  },
  { _id: false, versionKey: false, strict: true, minimize: false },
);

export const StorageConfigModel = model(
  "StorageConfig",
  storageConfigSchema,
  "storage_configs",
);
