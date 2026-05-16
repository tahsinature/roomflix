import { Schema, model } from "mongoose";

const spaceSchema = new Schema(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    ownerId: { type: String, required: true, index: true },
    createdAt: { type: Number, required: true },
    updatedAt: { type: Number, required: true },
  },
  { _id: false, versionKey: false, strict: true, minimize: false },
);

export const SpaceModel = model("Space", spaceSchema, "spaces");
