import { Schema, model } from "mongoose";

// Membership row. (spaceId, userId) is the natural unique key; the
// `_id` is a random short slug just so we have a stable handle for
// individual rows.
const spaceMemberSchema = new Schema(
  {
    _id: { type: String, required: true },
    spaceId: { type: String, required: true },
    userId: { type: String, required: true, index: true },
    username: { type: String, required: true },
    // Denormalized: lets member lists render without a per-row user
    // lookup. propagateUserProfile keeps these in sync.
    displayName: { type: String, default: null },
    timezone: { type: String, default: null },
    city: { type: String, default: null },
    role: { type: String, required: true, enum: ["owner", "member"] },
    joinedAt: { type: Number, required: true },
  },
  { _id: false, versionKey: false, strict: true, minimize: false },
);

spaceMemberSchema.index({ spaceId: 1, userId: 1 }, { unique: true });

export const SpaceMemberModel = model("SpaceMember", spaceMemberSchema, "space_members");
