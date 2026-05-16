import { Schema, model } from "mongoose";

// Persistent user account. `usernameLower` exists so case-insensitive
// lookup hits the unique index without per-query regex.
const userSchema = new Schema(
  {
    _id: { type: String, required: true },
    username: { type: String, required: true },
    usernameLower: { type: String, required: true, unique: true },
    passwordHash: { type: String, required: true },
    // null = "use @username". Modeled explicitly so toJSON / API
    // responses are stable.
    displayName: { type: String, default: null },
    isAdmin: { type: Boolean, default: false },
    createdAt: { type: Number, required: true },
  },
  { _id: false, versionKey: false, strict: true, minimize: false },
);

export const UserModel = model("User", userSchema, "users");
