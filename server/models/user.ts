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
    // IANA timezone like "America/Los_Angeles". Auto-detected from the
    // browser on first login; user can override in Settings.
    timezone: { type: String, default: null },
    // Free-form city label, used for weather lookup + display.
    city: { type: String, default: null },
    // Home page mini-monitor bezel style — "cinema" | "crt" | "minimal".
    // Null = use the default ("cinema").
    homeBezelStyle: { type: String, default: null },
    // Durable account-level UI choices. Nested fields let us add future
    // preferences without turning the user document into a flat key list.
    preferences: {
      discover: {
        moreLikeThisSort: {
          type: String,
          enum: ["recommended", "rating", "newest", "oldest", "title"],
          default: "recommended",
        },
      },
    },
    isAdmin: { type: Boolean, default: false },
    createdAt: { type: Number, required: true },
  },
  { _id: false, versionKey: false, strict: true, minimize: false },
);

export const UserModel = model("User", userSchema, "users");
