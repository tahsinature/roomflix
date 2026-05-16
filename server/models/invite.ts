import { Schema, model } from "mongoose";

// Short, human-shareable codes that grant access when redeemed.
// _id IS the code (8 chars, unambiguous alphabet — see generator).
const inviteSchema = new Schema(
  {
    _id: { type: String, required: true },
    spaceId: { type: String, required: true, index: true },
    createdBy: { type: String, required: true },
    kind: { type: String, required: true, enum: ["member", "guest"] },
    // null = unlimited uses. Decremented atomically by repo.consume.
    usesRemaining: { type: Number, default: null },
    // null = never expires.
    expiresAt: { type: Number, default: null },
    createdAt: { type: Number, required: true },
  },
  { _id: false, versionKey: false, strict: true, minimize: false },
);

export const InviteModel = model("Invite", inviteSchema, "invite_codes");
