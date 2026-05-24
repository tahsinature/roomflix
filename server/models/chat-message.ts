import { Schema, model } from "mongoose";

// Persistent chat messages per space. Sent over the WS chat channel,
// broadcast live to everyone in the session, and queryable as a history
// from /api/spaces/:id/chat — the remote-control page fetches this on
// mount so phones that join late can see what was said before.

const chatMomentSchema = new Schema(
  {
    videoUrl: { type: String, required: true },
    currentTime: { type: Number, required: true },
    mediaTitle: { type: String, default: "" },
    collectionId: { type: String, default: null },
    collectionIndex: { type: Number, default: null },
  },
  { _id: false },
);

const chatMessageSchema = new Schema(
  {
    _id: { type: String, required: true },
    spaceId: { type: String, required: true },
    senderId: { type: String, required: true },
    senderKind: { type: String, required: true }, // "user" | "guest"
    senderName: { type: String, required: true },
    text: { type: String, default: "" },
    moment: { type: chatMomentSchema, default: null },
    sentAt: { type: Number, required: true },
  },
  { _id: false, versionKey: false, strict: true, minimize: false },
);

// Newest-first scan + history paging both want a space-scoped index sorted
// by time. The retention sweeper also walks this index to find the
// oldest rows beyond the per-space cap.
chatMessageSchema.index({ spaceId: 1, sentAt: -1 });

export const ChatMessageModel = model("ChatMessage", chatMessageSchema, "chat_messages");
