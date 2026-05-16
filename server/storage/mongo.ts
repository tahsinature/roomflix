import mongoose from "mongoose";

import type {
  InviteCode,
  InviteKind,
  PairingCode,
  Playlist,
  Space,
  SpaceMember,
  SpaceRole,
  StorageActivation,
  StorageConfig,
  StorageConnection,
  StorageProvider,
  Subtitle,
  Video,
} from "@/protocol.ts";
import type {
  InviteRepo,
  MembershipRepo,
  PairingRepo,
  PlaylistRepo,
  Session,
  SessionRepo,
  SpaceRepo,
  Storage,
  StorageActivationRepo,
  StorageConfigRepo,
  StorageConnectionRepo,
  StoredUser,
  UserRepo,
  VideoRepo,
} from "@/storage/types.ts";
import {
  InviteModel,
  PairingModel,
  PlaylistModel,
  SessionModel,
  SpaceMemberModel,
  SpaceModel,
  StorageActivationModel,
  StorageConfigModel,
  StorageConnectionModel,
  UserModel,
  VideoModel,
} from "@/models/index.ts";
import { decrypt, encrypt } from "@/crypto.ts";

// Mongoose-backed Storage implementation. The model layer lives under
// server/models/ — each collection has its own schema file. This module
// is the thin repo layer that maps Mongoose docs ↔ wire shapes from
// protocol.ts, plus handles the bits Mongoose doesn't (encrypted
// secrets, denormalized fan-out, idempotent inserts).
//
// The exported repos preserve the same interface the rest of the server
// already depends on (server/storage/types.ts), so swapping to Mongoose
// is internal — no caller changes.

function randomId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export async function createMongoStorage(mongoUrl: string): Promise<Storage> {
  // One shared connection for the whole process. Mongoose owns a global
  // connection pool — using the default connection keeps every model
  // talking to the same pool without explicit wiring.
  const dbName = (() => {
    try {
      return new URL(mongoUrl).pathname.replace(/^\//, "") || "roomflix";
    } catch {
      return "roomflix";
    }
  })();
  await mongoose.connect(mongoUrl, { dbName });

  return {
    videos: new MongoVideoRepo(),
    users: new MongoUserRepo(),
    sessions: new MongoSessionRepo(),
    storageConfigs: new MongoStorageConfigRepo(),
    storageConnections: new MongoStorageConnectionRepo(),
    storageActivations: new MongoStorageActivationRepo(),
    playlists: new MongoPlaylistRepo(),
    spaces: new MongoSpaceRepo(),
    memberships: new MongoMembershipRepo(),
    invites: new MongoInviteRepo(),
    pairings: new MongoPairingRepo(),
    async close() {
      await mongoose.disconnect();
    },
  };
}

class MongoVideoRepo implements VideoRepo {
  async list(spaceId: string): Promise<Video[]> {
    const docs = await VideoModel.find({ spaceId }).sort({ addedAt: -1 }).lean();
    return docs.map(toVideo);
  }

  async get(spaceId: string, id: string): Promise<Video | null> {
    const doc = await VideoModel.findOne({ _id: id, spaceId }).lean();
    return doc ? toVideo(doc) : null;
  }

  async findByUrl(spaceId: string, url: string): Promise<Video | null> {
    const doc = await VideoModel.findOne({ spaceId, url: url.trim() }).lean();
    return doc ? toVideo(doc) : null;
  }

  async create(input: {
    spaceId: string;
    addedBy: string;
    url: string;
    title?: string;
    subtitles?: Subtitle[];
  }): Promise<Video> {
    const url = input.url.trim();
    const existing = await this.findByUrl(input.spaceId, url);
    if (existing) return existing;

    const now = Date.now();
    const doc = {
      _id: randomId(),
      spaceId: input.spaceId,
      addedBy: input.addedBy,
      url,
      title: input.title?.trim() || defaultTitleFromUrl(url),
      subtitles: input.subtitles ? input.subtitles.map(normalizeSubtitle) : [],
      addedAt: now,
      updatedAt: now,
    };

    try {
      await VideoModel.create(doc);
      return toVideo(doc);
    } catch (err) {
      if (isDuplicateKey(err)) {
        const winner = await this.findByUrl(input.spaceId, url);
        if (winner) return winner;
      }
      throw err;
    }
  }

  async update(
    spaceId: string,
    id: string,
    patch: { url?: string; title?: string; subtitles?: Subtitle[] },
  ): Promise<Video | null> {
    const existing = await VideoModel.findOne({ _id: id, spaceId }).lean();
    if (!existing) return null;

    const nextUrl = patch.url !== undefined ? patch.url.trim() : existing.url;
    // If the caller didn't pass a title, only auto-rederive when the
    // previous title was clearly a URL-derived default — otherwise keep
    // whatever custom title was there.
    const nextTitle =
      patch.title !== undefined
        ? patch.title.trim() || defaultTitleFromUrl(nextUrl)
        : existing.title === existing.url || existing.title === defaultTitleFromUrl(existing.url)
          ? defaultTitleFromUrl(nextUrl)
          : existing.title;

    const set: Record<string, unknown> = {
      url: nextUrl,
      title: nextTitle,
      updatedAt: Date.now(),
    };
    if (patch.subtitles !== undefined) {
      set.subtitles = patch.subtitles.map(normalizeSubtitle);
    }

    const updated = await VideoModel.findOneAndUpdate({ _id: id, spaceId }, { $set: set }, { returnDocument: "after" }).lean();
    return updated ? toVideo(updated) : null;
  }

  async remove(spaceId: string, id: string): Promise<boolean> {
    const result = await VideoModel.deleteOne({ _id: id, spaceId });
    return result.deletedCount === 1;
  }

  async reparent(oldOwnerId: string, spaceId: string): Promise<number> {
    const result = await VideoModel.updateMany(
      { ownerId: oldOwnerId },
      { $set: { spaceId, addedBy: oldOwnerId }, $unset: { ownerId: "" } },
    );
    return result.modifiedCount;
  }
}

class MongoUserRepo implements UserRepo {
  async findByUsername(username: string): Promise<StoredUser | null> {
    const doc = await UserModel.findOne({ usernameLower: username.toLowerCase() }).lean();
    return doc ? toStoredUser(doc) : null;
  }

  async findById(id: string): Promise<StoredUser | null> {
    const doc = await UserModel.findOne({ _id: id }).lean();
    return doc ? toStoredUser(doc) : null;
  }

  async create(input: { username: string; passwordHash: string; isAdmin: boolean }): Promise<StoredUser> {
    const doc = {
      _id: randomId(),
      username: input.username,
      usernameLower: input.username.toLowerCase(),
      passwordHash: input.passwordHash,
      displayName: null,
      isAdmin: input.isAdmin,
      createdAt: Date.now(),
    };
    await UserModel.create(doc);
    return toStoredUser(doc);
  }

  async count(): Promise<number> {
    return UserModel.estimatedDocumentCount();
  }

  async listAll(): Promise<StoredUser[]> {
    const docs = await UserModel.find({}).lean();
    return docs.map(toStoredUser);
  }

  async updateProfile(id: string, patch: { displayName?: string | null }): Promise<StoredUser | null> {
    const set: Record<string, unknown> = {};
    if (patch.displayName !== undefined) set.displayName = patch.displayName;
    if (Object.keys(set).length === 0) {
      const existing = await UserModel.findOne({ _id: id }).lean();
      return existing ? toStoredUser(existing) : null;
    }
    const updated = await UserModel.findOneAndUpdate({ _id: id }, { $set: set }, { returnDocument: "after" }).lean();
    return updated ? toStoredUser(updated) : null;
  }
}

class MongoSessionRepo implements SessionRepo {
  async create(input: {
    token: string;
    userId: string | null;
    currentSpaceId: string | null;
    guestDisplayName: string | null;
    expiresAt: number;
  }): Promise<Session> {
    const doc = {
      _id: input.token,
      userId: input.userId,
      currentSpaceId: input.currentSpaceId,
      guestDisplayName: input.guestDisplayName,
      createdAt: Date.now(),
      expiresAt: new Date(input.expiresAt),
    };
    await SessionModel.create(doc);
    return toSession(doc);
  }

  async findByToken(token: string): Promise<Session | null> {
    const doc = await SessionModel.findOne({ _id: token }).lean();
    if (!doc) return null;
    // TTL index reaps eventually, but be defensive — if the row is past
    // its expiry, treat it as gone and delete proactively.
    if (doc.expiresAt.getTime() < Date.now()) {
      await SessionModel.deleteOne({ _id: token }).catch(() => undefined);
      return null;
    }
    return toSession(doc);
  }

  async setCurrentSpace(token: string, spaceId: string | null): Promise<void> {
    await SessionModel.updateOne({ _id: token }, { $set: { currentSpaceId: spaceId } });
  }

  async setGuestDisplayName(token: string, displayName: string): Promise<void> {
    await SessionModel.updateOne({ _id: token }, { $set: { guestDisplayName: displayName } });
  }

  async deleteByToken(token: string): Promise<boolean> {
    const result = await SessionModel.deleteOne({ _id: token });
    return result.deletedCount === 1;
  }
}

class MongoStorageConfigRepo implements StorageConfigRepo {
  async get(spaceId: string): Promise<StorageConfig | null> {
    const doc = await StorageConfigModel.findOne({ _id: spaceId }).lean();
    return doc ? toStorageConfig(doc) : null;
  }

  async put(spaceId: string, input: Omit<StorageConfig, "updatedAt">): Promise<StorageConfig> {
    const now = Date.now();
    const doc = {
      _id: spaceId,
      provider: input.provider,
      accountId: input.accountId,
      bucket: input.bucket,
      accessKeyId: input.accessKeyId,
      secretAccessKeyEnc: encrypt(input.secretAccessKey),
      publicBaseUrl: input.publicBaseUrl,
      maxBytes: input.maxBytes,
      label: input.label,
      updatedAt: now,
    };
    await StorageConfigModel.replaceOne({ _id: spaceId }, doc, { upsert: true });
    return toStorageConfig(doc);
  }

  async remove(spaceId: string): Promise<boolean> {
    const result = await StorageConfigModel.deleteOne({ _id: spaceId });
    return result.deletedCount === 1;
  }

  async listUnmigrated(): Promise<Array<StorageConfig & { _legacyKey: string }>> {
    const docs = await StorageConfigModel.find({ migratedAt: { $exists: false } }).lean();
    return docs.map((doc) => ({ ...toStorageConfig(doc), _legacyKey: doc._id }));
  }

  async markMigrated(legacyKey: string): Promise<boolean> {
    const result = await StorageConfigModel.updateOne({ _id: legacyKey }, { $set: { migratedAt: Date.now() } });
    return result.modifiedCount === 1;
  }
}

class MongoStorageConnectionRepo implements StorageConnectionRepo {
  async listForOwner(ownerId: string): Promise<StorageConnection[]> {
    const docs = await StorageConnectionModel.find({ ownerId }).sort({ createdAt: 1 }).lean();
    return docs.map(toStorageConnection);
  }

  async get(id: string): Promise<StorageConnection | null> {
    const doc = await StorageConnectionModel.findOne({ _id: id }).lean();
    return doc ? toStorageConnection(doc) : null;
  }

  async getMany(ids: string[]): Promise<StorageConnection[]> {
    if (ids.length === 0) return [];
    const docs = await StorageConnectionModel.find({ _id: { $in: ids } }).lean();
    return docs.map(toStorageConnection);
  }

  async getSecret(id: string): Promise<string | null> {
    const doc = await StorageConnectionModel.findOne({ _id: id }).lean();
    if (!doc) return null;
    return decrypt(doc.secretAccessKeyEnc);
  }

  async create(input: {
    ownerId: string;
    label: string;
    provider: StorageProvider;
    accountId: string;
    bucket: string;
    accessKeyId: string;
    secretAccessKey: string;
    publicBaseUrl?: string;
    maxBytes: number;
  }): Promise<StorageConnection> {
    const now = Date.now();
    const doc = {
      _id: randomId(),
      ownerId: input.ownerId,
      label: input.label.trim(),
      provider: input.provider,
      accountId: input.accountId.trim(),
      bucket: input.bucket.trim(),
      accessKeyId: input.accessKeyId.trim(),
      // Encrypt at the repo boundary; the model never sees plaintext.
      secretAccessKeyEnc: encrypt(input.secretAccessKey),
      publicBaseUrl: input.publicBaseUrl?.trim() || undefined,
      maxBytes: input.maxBytes,
      createdAt: now,
      updatedAt: now,
    };
    await StorageConnectionModel.create(doc);
    return toStorageConnection(doc);
  }

  async update(
    id: string,
    patch: {
      label?: string;
      accountId?: string;
      bucket?: string;
      accessKeyId?: string;
      secretAccessKey?: string;
      publicBaseUrl?: string;
      maxBytes?: number;
    },
  ): Promise<StorageConnection | null> {
    const set: Record<string, unknown> = { updatedAt: Date.now() };
    if (patch.label !== undefined) set.label = patch.label.trim();
    if (patch.accountId !== undefined) set.accountId = patch.accountId.trim();
    if (patch.bucket !== undefined) set.bucket = patch.bucket.trim();
    if (patch.accessKeyId !== undefined) set.accessKeyId = patch.accessKeyId.trim();
    if (patch.secretAccessKey !== undefined) set.secretAccessKeyEnc = encrypt(patch.secretAccessKey);
    if (patch.publicBaseUrl !== undefined) set.publicBaseUrl = patch.publicBaseUrl.trim() || undefined;
    if (patch.maxBytes !== undefined) set.maxBytes = patch.maxBytes;
    const updated = await StorageConnectionModel.findOneAndUpdate({ _id: id }, { $set: set }, { returnDocument: "after" }).lean();
    return updated ? toStorageConnection(updated) : null;
  }

  async remove(id: string): Promise<boolean> {
    const result = await StorageConnectionModel.deleteOne({ _id: id });
    return result.deletedCount === 1;
  }
}

class MongoStorageActivationRepo implements StorageActivationRepo {
  async listForOwner(_ownerId: string): Promise<StorageActivation[]> {
    // Activations don't carry ownerId — we join through connections.
    // Routes use listForConnection in a per-id loop; this method exists
    // for interface parity but isn't wired anywhere yet.
    return [];
  }

  async listForSpace(spaceId: string): Promise<StorageActivation[]> {
    const docs = await StorageActivationModel.find({ spaceId }).lean();
    return docs.map(toStorageActivation);
  }

  async listForConnection(connectionId: string): Promise<StorageActivation[]> {
    const docs = await StorageActivationModel.find({ connectionId }).lean();
    return docs.map(toStorageActivation);
  }

  async add(input: { connectionId: string; spaceId: string; openToGuests?: boolean }): Promise<StorageActivation> {
    const id = `${input.connectionId}:${input.spaceId}`;
    const existing = await StorageActivationModel.findOne({ _id: id }).lean();
    const doc = {
      _id: id,
      connectionId: input.connectionId,
      spaceId: input.spaceId,
      // Preserve activatedAt on re-activate so the row's history is
      // stable; only flip the openToGuests flag.
      activatedAt: existing?.activatedAt ?? Date.now(),
      openToGuests: input.openToGuests ?? existing?.openToGuests ?? false,
    };
    await StorageActivationModel.replaceOne({ _id: id }, doc, { upsert: true });
    return toStorageActivation(doc);
  }

  async remove(connectionId: string, spaceId: string): Promise<boolean> {
    const result = await StorageActivationModel.deleteOne({ _id: `${connectionId}:${spaceId}` });
    return result.deletedCount === 1;
  }

  async removeAllForConnection(connectionId: string): Promise<number> {
    const result = await StorageActivationModel.deleteMany({ connectionId });
    return result.deletedCount ?? 0;
  }

  async removeAllForSpace(spaceId: string): Promise<number> {
    const result = await StorageActivationModel.deleteMany({ spaceId });
    return result.deletedCount ?? 0;
  }
}

class MongoPlaylistRepo implements PlaylistRepo {
  async list(spaceId: string): Promise<Playlist[]> {
    const docs = await PlaylistModel.find({ spaceId }).sort({ createdAt: -1 }).lean();
    return docs.map(toPlaylist);
  }

  async get(spaceId: string, id: string): Promise<Playlist | null> {
    const doc = await PlaylistModel.findOne({ _id: id, spaceId }).lean();
    return doc ? toPlaylist(doc) : null;
  }

  async getById(id: string): Promise<Playlist | null> {
    const doc = await PlaylistModel.findOne({ _id: id }).lean();
    return doc ? toPlaylist(doc) : null;
  }

  async create(input: { spaceId: string; createdBy: string; title: string; videoIds: string[] }): Promise<Playlist> {
    const now = Date.now();
    const doc = {
      _id: randomId(),
      spaceId: input.spaceId,
      createdBy: input.createdBy,
      title: input.title.trim() || "Untitled playlist",
      videoIds: dedupe(input.videoIds),
      createdAt: now,
      updatedAt: now,
    };
    await PlaylistModel.create(doc);
    return toPlaylist(doc);
  }

  async update(
    spaceId: string,
    id: string,
    patch: { title?: string; videoIds?: string[] },
  ): Promise<Playlist | null> {
    const set: Record<string, unknown> = { updatedAt: Date.now() };
    if (patch.title !== undefined) set.title = patch.title.trim() || "Untitled playlist";
    if (patch.videoIds !== undefined) set.videoIds = dedupe(patch.videoIds);
    const updated = await PlaylistModel.findOneAndUpdate({ _id: id, spaceId }, { $set: set }, { returnDocument: "after" }).lean();
    return updated ? toPlaylist(updated) : null;
  }

  async remove(spaceId: string, id: string): Promise<boolean> {
    const result = await PlaylistModel.deleteOne({ _id: id, spaceId });
    return result.deletedCount === 1;
  }

  async reparent(oldOwnerId: string, spaceId: string): Promise<number> {
    const result = await PlaylistModel.updateMany(
      { ownerId: oldOwnerId },
      { $set: { spaceId, createdBy: oldOwnerId }, $unset: { ownerId: "" } },
    );
    return result.modifiedCount;
  }
}

class MongoSpaceRepo implements SpaceRepo {
  async get(id: string): Promise<Space | null> {
    const doc = await SpaceModel.findOne({ _id: id }).lean();
    return doc ? toSpace(doc) : null;
  }

  async create(input: { name: string; ownerId: string }): Promise<Space> {
    const now = Date.now();
    const doc = {
      _id: randomId(),
      name: input.name.trim() || "Untitled space",
      ownerId: input.ownerId,
      createdAt: now,
      updatedAt: now,
    };
    await SpaceModel.create(doc);
    return toSpace(doc);
  }

  async update(id: string, patch: { name?: string }): Promise<Space | null> {
    const set: Record<string, unknown> = { updatedAt: Date.now() };
    if (patch.name !== undefined) set.name = patch.name.trim() || "Untitled space";
    const updated = await SpaceModel.findOneAndUpdate({ _id: id }, { $set: set }, { returnDocument: "after" }).lean();
    return updated ? toSpace(updated) : null;
  }

  async remove(id: string): Promise<boolean> {
    const result = await SpaceModel.deleteOne({ _id: id });
    return result.deletedCount === 1;
  }
}

class MongoMembershipRepo implements MembershipRepo {
  async add(input: {
    spaceId: string;
    userId: string;
    username: string;
    role: SpaceRole;
    displayName?: string | null;
  }): Promise<SpaceMember> {
    const existing = await SpaceMemberModel.findOne({ spaceId: input.spaceId, userId: input.userId }).lean();
    if (existing) return toMember(existing);
    const doc = {
      _id: randomId(),
      spaceId: input.spaceId,
      userId: input.userId,
      username: input.username,
      displayName: input.displayName ?? null,
      role: input.role,
      joinedAt: Date.now(),
    };
    await SpaceMemberModel.create(doc);
    return toMember(doc);
  }

  async remove(spaceId: string, userId: string): Promise<boolean> {
    const result = await SpaceMemberModel.deleteOne({ spaceId, userId });
    return result.deletedCount === 1;
  }

  async get(spaceId: string, userId: string): Promise<SpaceMember | null> {
    const doc = await SpaceMemberModel.findOne({ spaceId, userId }).lean();
    return doc ? toMember(doc) : null;
  }

  async listForSpace(spaceId: string): Promise<SpaceMember[]> {
    const docs = await SpaceMemberModel.find({ spaceId }).sort({ joinedAt: 1 }).lean();
    return docs.map(toMember);
  }

  async listForUser(userId: string): Promise<SpaceMember[]> {
    const docs = await SpaceMemberModel.find({ userId }).sort({ joinedAt: 1 }).lean();
    return docs.map(toMember);
  }

  async removeAllForSpace(spaceId: string): Promise<number> {
    const result = await SpaceMemberModel.deleteMany({ spaceId });
    return result.deletedCount;
  }

  async updateDisplayNameForUser(userId: string, displayName: string | null): Promise<number> {
    const result = await SpaceMemberModel.updateMany({ userId }, { $set: { displayName } });
    return result.modifiedCount;
  }
}

class MongoInviteRepo implements InviteRepo {
  async create(input: {
    spaceId: string;
    createdBy: string;
    kind: InviteKind;
    usesRemaining: number | null;
    expiresAt: number | null;
  }): Promise<InviteCode> {
    const doc = {
      _id: generateInviteCode(),
      spaceId: input.spaceId,
      createdBy: input.createdBy,
      kind: input.kind,
      usesRemaining: input.usesRemaining,
      expiresAt: input.expiresAt,
      createdAt: Date.now(),
    };
    await InviteModel.create(doc);
    return toInvite(doc);
  }

  async get(code: string): Promise<InviteCode | null> {
    const doc = await InviteModel.findOne({ _id: code }).lean();
    return doc ? toInvite(doc) : null;
  }

  async listForSpace(spaceId: string): Promise<InviteCode[]> {
    const docs = await InviteModel.find({ spaceId }).sort({ createdAt: -1 }).lean();
    return docs.map(toInvite);
  }

  async remove(code: string): Promise<boolean> {
    const result = await InviteModel.deleteOne({ _id: code });
    return result.deletedCount === 1;
  }

  async consume(code: string): Promise<InviteCode | null> {
    const existing = await InviteModel.findOne({ _id: code }).lean();
    if (!existing) return null;
    const expiresAt = existing.expiresAt ?? null;
    const usesRemaining = existing.usesRemaining ?? null;
    // Reject expired codes outright — even if uses remain.
    if (expiresAt !== null && expiresAt < Date.now()) return null;
    if (usesRemaining === null) return toInvite(existing);
    if (usesRemaining <= 0) return null;
    const updated = await InviteModel.findOneAndUpdate(
      { _id: code, usesRemaining: { $gt: 0 } },
      { $inc: { usesRemaining: -1 } },
      { returnDocument: "after" },
    ).lean();
    return updated ? toInvite(updated) : null;
  }

  async removeAllForSpace(spaceId: string): Promise<number> {
    const result = await InviteModel.deleteMany({ spaceId });
    return result.deletedCount;
  }
}

// Human-friendly invite codes — 8 chars, unambiguous alphabet (no 0/O/1/I/l).
// 28^8 ≈ 3.8e11 — plenty of entropy for the personal scale we target.
function generateInviteCode(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 8; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

class MongoPairingRepo implements PairingRepo {
  async create(input: { displayName: string; ttlMs: number }): Promise<PairingCode> {
    // Retry on collision — 10^8 is plenty of space at the scale we
    // target, but the loop is cheap insurance against the rare clash.
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generatePairingCode();
      const now = Date.now();
      const doc = {
        _id: code,
        displayName: input.displayName,
        status: "pending" as const,
        spaceId: null,
        spaceName: null,
        sessionToken: null,
        createdAt: now,
        expiresAt: new Date(now + input.ttlMs),
      };
      try {
        await PairingModel.create(doc);
        return toPairing(doc);
      } catch (err) {
        if (!isDuplicateKey(err)) throw err;
        // collision — pick a new code and try again
      }
    }
    throw new Error("could not allocate a pairing code; please retry");
  }

  async get(code: string): Promise<PairingCode | null> {
    const doc = await PairingModel.findOne({ _id: code }).lean();
    if (!doc) return null;
    if (doc.expiresAt.getTime() < Date.now()) {
      // TTL index hasn't reaped it yet — treat as gone.
      await PairingModel.deleteOne({ _id: code }).catch(() => undefined);
      return null;
    }
    return toPairing(doc);
  }

  async approve(
    code: string,
    input: { spaceId: string; spaceName: string; sessionToken: string },
  ): Promise<PairingCode | null> {
    // Atomic: only flip if still pending and not yet expired.
    const updated = await PairingModel.findOneAndUpdate(
      { _id: code, status: "pending", expiresAt: { $gt: new Date() } },
      {
        $set: {
          status: "approved",
          spaceId: input.spaceId,
          spaceName: input.spaceName,
          sessionToken: input.sessionToken,
        },
      },
      { returnDocument: "after" },
    ).lean();
    return updated ? toPairing(updated) : null;
  }

  async consume(code: string): Promise<boolean> {
    const result = await PairingModel.deleteOne({ _id: code });
    return result.deletedCount === 1;
  }
}

// Pure-numeric 8-digit pairing code. Displayed to the guest as
// XXXX XXXX — easy to read aloud, easy to type back on the admin side.
function generatePairingCode(): string {
  let out = "";
  for (let i = 0; i < 8; i++) {
    out += Math.floor(Math.random() * 10).toString();
  }
  return out;
}

// ──────────────────────────────────────────────────────────────────────
// Doc → wire converters. The repo never returns Mongoose documents
// directly; this is where _id becomes id, encrypted blobs get hidden,
// and missing fields on legacy rows get coerced to their wire defaults.

type VideoLean = {
  _id: string;
  spaceId: string;
  addedBy: string;
  url: string;
  title: string;
  subtitles: Subtitle[];
  addedAt: number;
  updatedAt: number;
};
function toVideo(doc: VideoLean): Video {
  return {
    id: doc._id,
    spaceId: doc.spaceId,
    addedBy: doc.addedBy,
    url: doc.url,
    title: doc.title,
    subtitles: doc.subtitles,
    addedAt: doc.addedAt,
    updatedAt: doc.updatedAt,
  };
}

type UserLean = {
  _id: string;
  username: string;
  displayName?: string | null;
  passwordHash: string;
  isAdmin: boolean;
  createdAt: number;
};
function toStoredUser(doc: UserLean): StoredUser {
  return {
    id: doc._id,
    username: doc.username,
    displayName: doc.displayName ?? null,
    passwordHash: doc.passwordHash,
    isAdmin: doc.isAdmin,
    createdAt: doc.createdAt,
  };
}

type SessionLean = {
  _id: string;
  userId?: string | null;
  currentSpaceId?: string | null;
  guestDisplayName?: string | null;
  createdAt: number;
  expiresAt: Date;
};
function toSession(doc: SessionLean): Session {
  return {
    token: doc._id,
    userId: doc.userId ?? null,
    currentSpaceId: doc.currentSpaceId ?? null,
    guestDisplayName: doc.guestDisplayName ?? null,
    createdAt: doc.createdAt,
    expiresAt: doc.expiresAt.getTime(),
  };
}

type StorageConfigLean = {
  _id: string;
  provider: "r2";
  accountId: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKeyEnc: string;
  publicBaseUrl?: string | null;
  maxBytes: number;
  label?: string | null;
  updatedAt: number;
};
function toStorageConfig(doc: StorageConfigLean): StorageConfig {
  return {
    provider: doc.provider,
    accountId: doc.accountId,
    bucket: doc.bucket,
    accessKeyId: doc.accessKeyId,
    secretAccessKey: decrypt(doc.secretAccessKeyEnc),
    publicBaseUrl: doc.publicBaseUrl ?? undefined,
    maxBytes: doc.maxBytes,
    label: doc.label ?? undefined,
    updatedAt: doc.updatedAt,
  };
}

type StorageConnectionLean = {
  _id: string;
  ownerId: string;
  label: string;
  provider: StorageProvider;
  accountId: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKeyEnc: string;
  publicBaseUrl?: string | null;
  maxBytes: number;
  createdAt: number;
  updatedAt: number;
};
function toStorageConnection(doc: StorageConnectionLean): StorageConnection {
  return {
    id: doc._id,
    ownerId: doc.ownerId,
    label: doc.label,
    provider: doc.provider,
    accountId: doc.accountId,
    bucket: doc.bucket,
    accessKeyId: doc.accessKeyId,
    publicBaseUrl: doc.publicBaseUrl ?? undefined,
    maxBytes: doc.maxBytes,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

type StorageActivationLean = {
  _id: string;
  connectionId: string;
  spaceId: string;
  activatedAt: number;
  openToGuests?: boolean;
};
function toStorageActivation(doc: StorageActivationLean): StorageActivation {
  return {
    connectionId: doc.connectionId,
    spaceId: doc.spaceId,
    activatedAt: doc.activatedAt,
    openToGuests: doc.openToGuests ?? false,
  };
}

type PlaylistLean = {
  _id: string;
  spaceId: string;
  createdBy: string;
  title: string;
  videoIds: string[];
  createdAt: number;
  updatedAt: number;
};
function toPlaylist(doc: PlaylistLean): Playlist {
  return {
    id: doc._id,
    spaceId: doc.spaceId,
    createdBy: doc.createdBy,
    title: doc.title,
    videoIds: doc.videoIds,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

type SpaceLean = {
  _id: string;
  name: string;
  ownerId: string;
  createdAt: number;
  updatedAt: number;
};
function toSpace(doc: SpaceLean): Space {
  return {
    id: doc._id,
    name: doc.name,
    ownerId: doc.ownerId,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

type SpaceMemberLean = {
  spaceId: string;
  userId: string;
  username: string;
  // Mongoose infers `default: null` fields as nullable-or-missing. The
  // converter coerces `?? null`, so accept either shape here.
  displayName?: string | null;
  role: SpaceRole;
  joinedAt: number;
};
function toMember(doc: SpaceMemberLean): SpaceMember {
  return {
    spaceId: doc.spaceId,
    userId: doc.userId,
    username: doc.username,
    displayName: doc.displayName ?? null,
    role: doc.role,
    joinedAt: doc.joinedAt,
  };
}

type InviteLean = {
  _id: string;
  spaceId: string;
  createdBy: string;
  kind: InviteKind;
  // Default-null fields are inferred as nullable-or-missing.
  usesRemaining?: number | null;
  expiresAt?: number | null;
  createdAt: number;
};
function toInvite(doc: InviteLean): InviteCode {
  return {
    code: doc._id,
    spaceId: doc.spaceId,
    createdBy: doc.createdBy,
    // Legacy codes pre-date the kind/expiresAt fields. Default kind to
    // "member" so existing rows keep their old semantics; null expiry
    // means they never expire.
    kind: doc.kind ?? "member",
    usesRemaining: doc.usesRemaining ?? null,
    expiresAt: doc.expiresAt ?? null,
    createdAt: doc.createdAt,
  };
}

type PairingLean = {
  _id: string;
  displayName: string;
  status: "pending" | "approved";
  spaceId?: string | null;
  spaceName?: string | null;
  sessionToken?: string | null;
  createdAt: number;
  expiresAt: Date;
};
function toPairing(doc: PairingLean): PairingCode {
  return {
    code: doc._id,
    displayName: doc.displayName,
    status: doc.status,
    spaceId: doc.spaceId ?? null,
    spaceName: doc.spaceName ?? null,
    sessionToken: doc.sessionToken ?? null,
    createdAt: doc.createdAt,
    expiresAt: doc.expiresAt.getTime(),
  };
}

// ──────────────────────────────────────────────────────────────────────
// Helpers

function dedupe(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (typeof id !== "string" || !id.trim()) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function defaultTitleFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const last = u.pathname.split("/").filter(Boolean).pop();
    if (!last) return u.hostname || url;
    try {
      return decodeURIComponent(last);
    } catch {
      return last;
    }
  } catch {
    return url;
  }
}

function normalizeSubtitle(s: Subtitle): Subtitle {
  return {
    id: s.id?.trim() || randomId(),
    url: s.url.trim(),
    label: s.label?.trim() || s.url.trim(),
    lang: s.lang?.trim() ?? "",
  };
}

function isDuplicateKey(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: number }).code === 11000;
}
