import { Schema, model } from "mongoose";

// One recorded open of a share link — the rows behind the Share Control
// page's per-link access log. Created on every successful resolve.

const shareAccessSchema = new Schema(
  {
    _id: { type: String, required: true },
    shareId: { type: String, required: true },
    ip: { type: String, default: "" },
    userAgent: { type: String, default: "" },
    accessedAt: { type: Number, required: true },
  },
  { _id: false, versionKey: false, strict: true, minimize: false },
);

shareAccessSchema.index({ shareId: 1, accessedAt: -1 });

export const ShareAccessModel = model("ShareAccess", shareAccessSchema, "share_accesses");
