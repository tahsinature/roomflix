import { Schema, model } from "mongoose";

// Account-scoped TMDB title state. This deliberately does not reference a
// Roomflix space or playable URL: discovery intent is personal, while media
// files and collections remain shared space resources.
const titleLibraryItemSchema = new Schema(
  {
    _id: { type: String, required: true },
    userId: { type: String, required: true, index: true },
    tmdbId: { type: Number, required: true },
    mediaType: { type: String, enum: ["movie", "tv"], required: true },
    title: { type: String, required: true, trim: true },
    year: { type: String, default: "" },
    posterPath: { type: String, default: null },
    backdropPath: { type: String, default: null },
    overview: { type: String, default: "" },
    voteAverage: { type: Number, default: 0 },
    voteCount: { type: Number, default: 0 },
    genres: { type: [String], default: [] },
    runtime: { type: Number, default: null },
    imdbId: { type: String, default: null },
    status: { type: String, enum: ["shortlist", "watched"], required: true },
    userRating: { type: Number, default: null },
    notes: { type: String, default: "" },
    addedAt: { type: Number, required: true },
    watchedAt: { type: Number, default: null },
    updatedAt: { type: Number, required: true },
  },
  { _id: false, versionKey: false, strict: true, minimize: false },
);

titleLibraryItemSchema.index({ userId: 1, mediaType: 1, tmdbId: 1 }, { unique: true });
titleLibraryItemSchema.index({ userId: 1, status: 1, updatedAt: -1 });

export const TitleLibraryItemModel = model("TitleLibraryItem", titleLibraryItemSchema, "title_library_items");
