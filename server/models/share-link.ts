import { Schema, model } from "mongoose";

// A public share link — a passcode-/expiry-gated pointer to a single
// media URL or a whole collection, reachable without a session at
// /share/:_id. `_id` is the high-entropy public code. `passcodeHash` is
// produced by Bun.password and never leaves the server.

const shareLinkSchema = new Schema(
  {
    _id: { type: String, required: true },
    spaceId: { type: String, required: true },
    createdBy: { type: String, required: true },
    label: { type: String, default: "" },
    targetKind: { type: String, required: true }, // "url" | "collection"
    targetUrl: { type: String, default: null },
    targetTitle: { type: String, default: null },
    targetCollectionId: { type: String, default: null },
    passcodeHash: { type: String, default: null },
    expiresAt: { type: Number, default: null },
    maxAccesses: { type: Number, default: null },
    accessCount: { type: Number, default: 0 },
    disabled: { type: Boolean, default: false },
    createdAt: { type: Number, required: true },
    lastAccessedAt: { type: Number, default: null },
  },
  { _id: false, versionKey: false, strict: true, minimize: false },
);

shareLinkSchema.index({ spaceId: 1, createdAt: -1 });

export const ShareLinkModel = model("ShareLink", shareLinkSchema, "share_links");
