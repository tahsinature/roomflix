import { Schema, model } from "mongoose";

// Cookie-backed session row. Mongo TTL index on `expiresAt` reaps
// expired rows in the background. A session is EITHER tied to a real
// user (userId set, guestDisplayName null) OR represents a guest
// (userId null, guestDisplayName set, currentSpaceId locked to the
// invite's space).
const sessionSchema = new Schema(
  {
    _id: { type: String, required: true }, // session token
    userId: { type: String, default: null, index: true },
    currentSpaceId: { type: String, default: null },
    guestDisplayName: { type: String, default: null },
    createdAt: { type: Number, required: true },
    // Stored as Date so the TTL index actually fires.
    expiresAt: { type: Date, required: true },
  },
  { _id: false, versionKey: false, strict: true, minimize: false },
);

sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const SessionModel = model("Session", sessionSchema, "sessions");
