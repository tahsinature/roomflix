import { Schema, model } from "mongoose";

// Account-level storage credentials. The plaintext secret is never
// stored — the repo encrypts on write (`secretAccessKeyEnc`) and only
// the explicit `getSecret` repo method decrypts.
const storageConnectionSchema = new Schema(
  {
    _id: { type: String, required: true },
    ownerId: { type: String, required: true, index: true },
    label: { type: String, required: true, trim: true },
    provider: { type: String, required: true, enum: ["r2", "s3"] },
    accountId: { type: String, trim: true },
    region: { type: String, trim: true },
    bucket: { type: String, required: true, trim: true },
    accessKeyId: { type: String, required: true, trim: true },
    // Ciphertext only. See server/crypto.ts.
    secretAccessKeyEnc: { type: String, required: true },
    publicBaseUrl: { type: String, trim: true },
    maxBytes: { type: Number, required: true, min: 0 },
    createdAt: { type: Number, required: true },
    updatedAt: { type: Number, required: true },
  },
  { _id: false, versionKey: false, strict: true, minimize: false },
);

export const StorageConnectionModel = model("StorageConnection", storageConnectionSchema, "storage_connections");
