import { Schema, model } from "mongoose";

// Personal discovery history. This is deliberately keyed to an account, not
// a Roomflix space, so it follows the user across devices and space switches.
const recentTitleItemSchema = new Schema(
  {
    _id: { type: String, required: true },
    userId: { type: String, required: true, index: true },
    tmdbId: { type: Number, required: true },
    mediaType: { type: String, enum: ["movie", "tv"], required: true },
    title: { type: String, required: true, trim: true },
    year: { type: String, default: "" },
    releaseDate: { type: String, default: "" },
    overview: { type: String, default: "" },
    posterPath: { type: String, default: null },
    backdropPath: { type: String, default: null },
    voteAverage: { type: Number, default: 0 },
    voteCount: { type: Number, default: 0 },
    adult: { type: Boolean, default: false },
    lastViewedAt: { type: Number, required: true },
    viewCount: { type: Number, required: true, default: 0 },
  },
  { _id: false, versionKey: false, strict: true, minimize: false },
);

recentTitleItemSchema.index({ userId: 1, mediaType: 1, tmdbId: 1 }, { unique: true });
recentTitleItemSchema.index({ userId: 1, lastViewedAt: -1 });

export const RecentTitleItemModel = model("RecentTitleItem", recentTitleItemSchema, "recent_title_items");
