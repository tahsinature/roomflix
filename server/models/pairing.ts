import { Schema, model } from "mongoose";

// Short-lived "I want to join" tickets for the TV-pairing guest flow.
// Mongo TTL index on `expiresAt` reaps abandoned codes automatically.
const pairingSchema = new Schema(
  {
    _id: { type: String, required: true }, // 8-digit numeric code
    displayName: { type: String, required: true },
    status: { type: String, required: true, enum: ["pending", "approved"] },
    spaceId: { type: String, default: null },
    spaceName: { type: String, default: null },
    sessionToken: { type: String, default: null },
    createdAt: { type: Number, required: true },
    expiresAt: { type: Date, required: true },
  },
  { _id: false, versionKey: false, strict: true, minimize: false },
);

pairingSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const PairingModel = model("Pairing", pairingSchema, "pairing_codes");
