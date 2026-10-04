import mongoose, { Schema, model } from "mongoose";

const schema = new Schema({ _id: String, data: Schema.Types.Mixed, expiresAt: Date }, { versionKey: false });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
const DiscoveryCache = model("DiscoveryCache", schema, "discovery_cache");

export type PersistentCache<T> = {
  get: (key: string) => Promise<{ data: T; expiresAt: number } | null>;
  set: (key: string, data: T, expiresAt: number) => Promise<void>;
};

export function createPersistentCache<T>(namespace: string): PersistentCache<T> {
  return {
    async get(key) {
      if (mongoose.connection.readyState !== 1) return null;
      const doc = await DiscoveryCache.findOne({ _id: `${namespace}:${key}`, expiresAt: { $gt: new Date() } }).lean();
      return doc?.expiresAt ? { data: doc.data as T, expiresAt: doc.expiresAt.getTime() } : null;
    },
    async set(key, data, expiresAt) {
      if (mongoose.connection.readyState !== 1) return;
      await DiscoveryCache.updateOne({ _id: `${namespace}:${key}` }, { $set: { data, expiresAt: new Date(expiresAt) } }, { upsert: true });
    },
  };
}
