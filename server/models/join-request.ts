import { Schema, model } from "mongoose";

// Pending invite redemption. Created when a recipient hits a code on
// a space whose joinPolicy is "approval"; the owner approves/denies
// from the space settings page. TTL index reaps expired rows.

const joinRequesterSchema = new Schema(
  {
    kind: { type: String, required: true, enum: ["user", "guest"] },
    userId: { type: String, default: null },
    username: { type: String, default: null },
    displayName: { type: String, default: null },
  },
  { _id: false },
);

const joinRequestSchema = new Schema(
  {
    _id: { type: String, required: true },
    spaceId: { type: String, required: true, index: true },
    code: { type: String, required: true },
    requester: { type: joinRequesterSchema, required: true },
    status: {
      type: String,
      required: true,
      enum: ["pending", "approved", "denied", "expired", "cancelled"],
      default: "pending",
    },
    requestedAt: { type: Number, required: true },
    // Stored as Date so the TTL index can sweep abandoned rows. The
    // wire shape uses epoch-ms; the converter handles the swap.
    expiresAt: { type: Date, required: true },
    // For guest approvals: the new session token gets minted server-
    // side at approve-time and stashed here so the waiting room can
    // pick it up via the next status poll (server sets cookie too).
    approvedSessionToken: { type: String, default: null },
  },
  { _id: false, versionKey: false, strict: true, minimize: false },
);

joinRequestSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const JoinRequestModel = model("JoinRequest", joinRequestSchema, "join_requests");
