import { Schema, model } from "mongoose";

// One-use, time-limited token that lets a user reset their password.
// `_id` IS the token itself (a 32-byte url-safe random) so lookup is
// just `findById`. Plaintext storage is a deliberate trade — until
// email is wired up the operator grabs the link from server logs or
// the DB itself, and rotating that workflow into hashed storage
// breaks the manual-recovery path. The TTL + one-use semantics cap
// the window where the token has any value.
const passwordResetTokenSchema = new Schema(
  {
    _id: { type: String, required: true },
    userId: { type: String, required: true, index: true },
    createdAt: { type: Number, required: true },
    expiresAt: { type: Number, required: true },
    // Null while the token is still valid. Set to the consumption time
    // once used. We keep the row around (rather than deleting on use)
    // so a refresh of the confirm page doesn't look like "token not
    // found" — it can report "already used" explicitly.
    usedAt: { type: Number, default: null },
  },
  { _id: false, versionKey: false, strict: true, minimize: false },
);

export const PasswordResetTokenModel = model("PasswordResetToken", passwordResetTokenSchema, "password_reset_tokens");
