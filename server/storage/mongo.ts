import mongoose from "mongoose";

import type {
  ChatMessage,
  ChatMoment,
  Collection,
  CollectionItem,
  CollectionSource,
  InviteCode,
  JoinRequest,
  JoinRequester,
  JoinRequestStatus,
  ShareAccess,
  ShareLink,
  ShareTargetKind,
  Space,
  SpaceJoinPolicy,
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
  CollectionRepo,
  InviteRepo,
  JoinRequestRepo,
  MembershipRepo,
  ChatRepo,
  Session,
  SessionRepo,
  ShareAccessRepo,
  ShareLinkRepo,
  SpaceRepo,
  Storage,
  StorageActivationRepo,
  StorageConfigRepo,
  StorageConnectionRepo,
  StoredShareLink,
  StoredUser,
  UserRepo,
  VideoRepo,
} from "@/storage/types.ts";
import {
  ChatMessageModel,
  CollectionModel,
  InviteModel,
  JoinRequestModel,
  SessionModel,
  ShareAccessModel,
  ShareLinkModel,
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
    collections: new MongoCollectionRepo(),
    spaces: new MongoSpaceRepo(),
    memberships: new MongoMembershipRepo(),
    invites: new MongoInviteRepo(),
    joinRequests: new MongoJoinRequestRepo(),
    shareLinks: new MongoShareLinkRepo(),
    shareAccesses: new MongoShareAccessRepo(),
    chat: new MongoChatRepo(),
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

  async create(input: { spaceId: string; addedBy: string; url: string; title?: string; subtitles?: Subtitle[] }): Promise<Video> {
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

  async update(spaceId: string, id: string, patch: { url?: string; title?: string; subtitles?: Subtitle[] }): Promise<Video | null> {
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
    const result = await VideoModel.updateMany({ ownerId: oldOwnerId }, { $set: { spaceId, addedBy: oldOwnerId }, $unset: { ownerId: "" } });
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

  async updateProfile(
    id: string,
    patch: { displayName?: string | null; timezone?: string | null; city?: string | null; homeBezelStyle?: "cinema" | "crt" | "minimal" | null },
  ): Promise<StoredUser | null> {
    const set: Record<string, unknown> = {};
    if (patch.displayName !== undefined) set.displayName = patch.displayName;
    if (patch.timezone !== undefined) set.timezone = patch.timezone;
    if (patch.city !== undefined) set.city = patch.city;
    if (patch.homeBezelStyle !== undefined) set.homeBezelStyle = patch.homeBezelStyle;
    if (Object.keys(set).length === 0) {
      const existing = await UserModel.findOne({ _id: id }).lean();
      return existing ? toStoredUser(existing) : null;
    }
    const updated = await UserModel.findOneAndUpdate({ _id: id }, { $set: set }, { returnDocument: "after" }).lean();
    return updated ? toStoredUser(updated) : null;
  }
}

class MongoSessionRepo implements SessionRepo {
  async create(input: { token: string; userId: string | null; currentSpaceId: string | null; guestDisplayName: string | null; expiresAt: number }): Promise<Session> {
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

class MongoCollectionRepo implements CollectionRepo {
  async list(spaceId: string): Promise<Collection[]> {
    const docs = await CollectionModel.find({ spaceId }).sort({ createdAt: -1 }).lean();
    return docs.map(toCollection);
  }

  async get(spaceId: string, id: string): Promise<Collection | null> {
    const doc = await CollectionModel.findOne({ _id: id, spaceId }).lean();
    return doc ? toCollection(doc) : null;
  }

  async getById(id: string): Promise<Collection | null> {
    const doc = await CollectionModel.findOne({ _id: id }).lean();
    return doc ? toCollection(doc) : null;
  }

  async create(input: { spaceId: string; createdBy: string; title: string; items: CollectionItem[]; source: CollectionSource | null }): Promise<Collection> {
    const now = Date.now();
    const doc = {
      _id: randomId(),
      spaceId: input.spaceId,
      createdBy: input.createdBy,
      title: input.title.trim() || "Untitled collection",
      // Synced collections compute items live on read — don't store any.
      items: input.source ? [] : normalizeCollectionItems(input.items),
      sourceConnectionId: input.source?.connectionId ?? null,
      sourceFolderPrefix: input.source?.folderPrefix ?? null,
      createdAt: now,
      updatedAt: now,
    };
    await CollectionModel.create(doc);
    return toCollection(doc);
  }

  async update(spaceId: string, id: string, patch: { title?: string; items?: CollectionItem[] }): Promise<Collection | null> {
    const set: Record<string, unknown> = { updatedAt: Date.now() };
    if (patch.title !== undefined) set.title = patch.title.trim() || "Untitled collection";
    if (patch.items !== undefined) set.items = normalizeCollectionItems(patch.items);
    const updated = await CollectionModel.findOneAndUpdate({ _id: id, spaceId }, { $set: set }, { returnDocument: "after" }).lean();
    return updated ? toCollection(updated) : null;
  }

  async remove(spaceId: string, id: string): Promise<boolean> {
    const result = await CollectionModel.deleteOne({ _id: id, spaceId });
    return result.deletedCount === 1;
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
      joinPolicy: "open" as const,
      createdAt: now,
      updatedAt: now,
    };
    await SpaceModel.create(doc);
    return toSpace(doc);
  }

  async update(id: string, patch: { name?: string; joinPolicy?: SpaceJoinPolicy }): Promise<Space | null> {
    const set: Record<string, unknown> = { updatedAt: Date.now() };
    if (patch.name !== undefined) set.name = patch.name.trim() || "Untitled space";
    if (patch.joinPolicy !== undefined) set.joinPolicy = patch.joinPolicy;
    const updated = await SpaceModel.findOneAndUpdate({ _id: id }, { $set: set }, { returnDocument: "after" }).lean();
    return updated ? toSpace(updated) : null;
  }

  async remove(id: string): Promise<boolean> {
    const result = await SpaceModel.deleteOne({ _id: id });
    return result.deletedCount === 1;
  }
}

class MongoJoinRequestRepo implements JoinRequestRepo {
  async create(input: { spaceId: string; code: string; requester: JoinRequester; ttlMs: number }): Promise<JoinRequest> {
    const now = Date.now();
    const doc = {
      _id: randomId(),
      spaceId: input.spaceId,
      code: input.code,
      requester:
        input.requester.kind === "user"
          ? {
              kind: "user" as const,
              userId: input.requester.userId,
              username: input.requester.username,
              displayName: input.requester.displayName,
            }
          : { kind: "guest" as const, displayName: input.requester.displayName },
      status: "pending" as const,
      requestedAt: now,
      expiresAt: new Date(now + input.ttlMs),
      approvedSessionToken: null,
    };
    await JoinRequestModel.create(doc);
    return toJoinRequest(doc);
  }

  async get(id: string): Promise<JoinRequest | null> {
    const doc = await JoinRequestModel.findOne({ _id: id }).lean();
    if (!doc) return null;
    // TTL index sweeps eventually; be defensive here too.
    if (doc.expiresAt.getTime() < Date.now() && doc.status === "pending") {
      await JoinRequestModel.updateOne({ _id: id }, { $set: { status: "expired" } });
      return toJoinRequest({ ...doc, status: "expired" });
    }
    return toJoinRequest(doc);
  }

  async listPendingForSpace(spaceId: string): Promise<JoinRequest[]> {
    const docs = await JoinRequestModel.find({
      spaceId,
      status: "pending",
      expiresAt: { $gt: new Date() },
    })
      .sort({ requestedAt: 1 })
      .lean();
    return docs.map(toJoinRequest);
  }

  async approve(id: string, approvedSessionToken: string | null): Promise<JoinRequest | null> {
    // Atomic guard so a double-click only commits once.
    const updated = await JoinRequestModel.findOneAndUpdate(
      { _id: id, status: "pending", expiresAt: { $gt: new Date() } },
      { $set: { status: "approved", approvedSessionToken } },
      { returnDocument: "after" },
    ).lean();
    return updated ? toJoinRequest(updated) : null;
  }

  async setTerminalStatus(id: string, status: "denied" | "cancelled"): Promise<JoinRequest | null> {
    const updated = await JoinRequestModel.findOneAndUpdate({ _id: id, status: "pending" }, { $set: { status } }, { returnDocument: "after" }).lean();
    return updated ? toJoinRequest(updated) : null;
  }

  async removeAllForSpace(spaceId: string): Promise<number> {
    const result = await JoinRequestModel.deleteMany({ spaceId });
    return result.deletedCount ?? 0;
  }
}

class MongoMembershipRepo implements MembershipRepo {
  async add(input: { spaceId: string; userId: string; username: string; role: SpaceRole; displayName?: string | null }): Promise<SpaceMember> {
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

  async updateLocationForUser(userId: string, patch: { timezone?: string | null; city?: string | null }): Promise<number> {
    const set: Record<string, unknown> = {};
    if (patch.timezone !== undefined) set.timezone = patch.timezone;
    if (patch.city !== undefined) set.city = patch.city;
    if (Object.keys(set).length === 0) return 0;
    const result = await SpaceMemberModel.updateMany({ userId }, { $set: set });
    return result.modifiedCount;
  }
}

class MongoInviteRepo implements InviteRepo {
  async create(input: { spaceId: string; createdBy: string; usesRemaining: number | null; expiresAt: number | null }): Promise<InviteCode> {
    const doc = {
      _id: generateInviteCode(),
      spaceId: input.spaceId,
      createdBy: input.createdBy,
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
    const updated = await InviteModel.findOneAndUpdate({ _id: code, usesRemaining: { $gt: 0 } }, { $inc: { usesRemaining: -1 } }, { returnDocument: "after" }).lean();
    return updated ? toInvite(updated) : null;
  }

  async removeAllForSpace(spaceId: string): Promise<number> {
    const result = await InviteModel.deleteMany({ spaceId });
    return result.deletedCount;
  }
}

class MongoShareLinkRepo implements ShareLinkRepo {
  async listForSpace(spaceId: string): Promise<ShareLink[]> {
    const docs = await ShareLinkModel.find({ spaceId }).sort({ createdAt: -1 }).lean();
    return docs.map(toShareLink);
  }

  async get(spaceId: string, id: string): Promise<ShareLink | null> {
    const doc = await ShareLinkModel.findOne({ _id: id, spaceId }).lean();
    return doc ? toShareLink(doc) : null;
  }

  async getByCode(code: string): Promise<StoredShareLink | null> {
    const doc = await ShareLinkModel.findOne({ _id: code }).lean();
    return doc ? toStoredShareLink(doc) : null;
  }

  async create(input: {
    spaceId: string;
    createdBy: string;
    label: string;
    targetKind: ShareTargetKind;
    targetUrl: string | null;
    targetTitle: string | null;
    targetCollectionId: string | null;
    passcodeHash: string | null;
    expiresAt: number | null;
    maxAccesses: number | null;
  }): Promise<ShareLink> {
    const doc = {
      _id: generateShareCode(),
      spaceId: input.spaceId,
      createdBy: input.createdBy,
      label: input.label.trim(),
      targetKind: input.targetKind,
      targetUrl: input.targetUrl,
      targetTitle: input.targetTitle,
      targetCollectionId: input.targetCollectionId,
      passcodeHash: input.passcodeHash,
      expiresAt: input.expiresAt,
      maxAccesses: input.maxAccesses,
      accessCount: 0,
      disabled: false,
      createdAt: Date.now(),
      lastAccessedAt: null,
    };
    await ShareLinkModel.create(doc);
    return toShareLink(doc);
  }

  async update(
    spaceId: string,
    id: string,
    patch: { label?: string; disabled?: boolean; expiresAt?: number | null; maxAccesses?: number | null; passcodeHash?: string | null },
  ): Promise<ShareLink | null> {
    const set: Record<string, unknown> = {};
    if (patch.label !== undefined) set.label = patch.label.trim();
    if (patch.disabled !== undefined) set.disabled = patch.disabled;
    if (patch.expiresAt !== undefined) set.expiresAt = patch.expiresAt;
    if (patch.maxAccesses !== undefined) set.maxAccesses = patch.maxAccesses;
    if (patch.passcodeHash !== undefined) set.passcodeHash = patch.passcodeHash;
    const updated = await ShareLinkModel.findOneAndUpdate({ _id: id, spaceId }, { $set: set }, { returnDocument: "after" }).lean();
    return updated ? toShareLink(updated) : null;
  }

  async remove(spaceId: string, id: string): Promise<boolean> {
    const result = await ShareLinkModel.deleteOne({ _id: id, spaceId });
    return result.deletedCount === 1;
  }

  async recordAccess(code: string): Promise<void> {
    await ShareLinkModel.updateOne({ _id: code }, { $inc: { accessCount: 1 }, $set: { lastAccessedAt: Date.now() } });
  }

  async removeAllForSpace(spaceId: string): Promise<number> {
    const result = await ShareLinkModel.deleteMany({ spaceId });
    return result.deletedCount;
  }
}

class MongoChatRepo implements ChatRepo {
  async add(input: { spaceId: string; senderId: string; senderKind: "user" | "guest"; senderName: string; text: string; moment: ChatMoment | null }): Promise<ChatMessage> {
    const doc = {
      _id: randomId() + randomId(),
      spaceId: input.spaceId,
      senderId: input.senderId,
      senderKind: input.senderKind,
      senderName: input.senderName,
      text: input.text,
      moment: input.moment,
      sentAt: Date.now(),
    };
    await ChatMessageModel.create(doc);
    return toChatMessage(doc);
  }

  async listForSpace(spaceId: string, limit: number): Promise<ChatMessage[]> {
    // Pull the most-recent N (sorted desc), then reverse to ascending so
    // the client can render top-to-bottom and append new arrivals.
    const docs = await ChatMessageModel.find({ spaceId }).sort({ sentAt: -1 }).limit(limit).lean();
    return docs.reverse().map(toChatMessage);
  }

  async trim(spaceId: string, keepLast: number): Promise<number> {
    // Find the cutoff: the (keepLast+1)-th newest sentAt. Anything older
    // gets deleted. Single index scan to find the boundary, one delete.
    const boundary = await ChatMessageModel.find({ spaceId }).sort({ sentAt: -1 }).skip(keepLast).limit(1).select({ sentAt: 1 }).lean();
    const cutoff = boundary[0]?.sentAt;
    if (cutoff === undefined) return 0;
    const result = await ChatMessageModel.deleteMany({ spaceId, sentAt: { $lte: cutoff } });
    return result.deletedCount;
  }

  async distinctSpaceIds(): Promise<string[]> {
    const ids = await ChatMessageModel.distinct("spaceId");
    return ids as string[];
  }

  async removeAllForSpace(spaceId: string): Promise<number> {
    const result = await ChatMessageModel.deleteMany({ spaceId });
    return result.deletedCount;
  }
}

class MongoShareAccessRepo implements ShareAccessRepo {
  async add(input: { shareId: string; ip: string; userAgent: string }): Promise<void> {
    await ShareAccessModel.create({
      _id: randomId() + randomId(),
      shareId: input.shareId,
      ip: input.ip,
      userAgent: input.userAgent,
      accessedAt: Date.now(),
    });
  }

  async listForShare(shareId: string): Promise<ShareAccess[]> {
    const docs = await ShareAccessModel.find({ shareId }).sort({ accessedAt: -1 }).lean();
    return docs.map(toShareAccess);
  }

  async removeAllForShare(shareId: string): Promise<number> {
    const result = await ShareAccessModel.deleteMany({ shareId });
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

// Public share codes. Unlike invite codes these are reachable WITHOUT a
// session — the code IS the credential — so they're crypto-random and
// long: 24 chars over a 54-symbol alphabet ≈ 138 bits, unguessable.
function generateShareCode(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789ACDEFGHJKLMNPQRSTUVWXYZ";
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += alphabet[b % alphabet.length];
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
  timezone?: string | null;
  city?: string | null;
  homeBezelStyle?: string | null;
  passwordHash: string;
  isAdmin: boolean;
  createdAt: number;
};
function toStoredUser(doc: UserLean): StoredUser {
  const bezel = doc.homeBezelStyle;
  return {
    id: doc._id,
    username: doc.username,
    displayName: doc.displayName ?? null,
    timezone: doc.timezone ?? null,
    city: doc.city ?? null,
    homeBezelStyle: bezel === "cinema" || bezel === "crt" || bezel === "minimal" ? bezel : null,
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

type CollectionLean = {
  _id: string;
  spaceId: string;
  createdBy: string;
  title: string;
  items?: Array<{ url: string; name?: string | null }>;
  sourceConnectionId?: string | null;
  sourceFolderPrefix?: string | null;
  createdAt: number;
  updatedAt: number;
};
function toCollection(doc: CollectionLean): Collection {
  return {
    id: doc._id,
    spaceId: doc.spaceId,
    createdBy: doc.createdBy,
    title: doc.title,
    items: (doc.items ?? []).map((it) => ({ url: it.url, name: it.name ?? "" })),
    source: doc.sourceConnectionId && doc.sourceFolderPrefix ? { connectionId: doc.sourceConnectionId, folderPrefix: doc.sourceFolderPrefix } : null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

type SpaceLean = {
  _id: string;
  name: string;
  ownerId: string;
  // Pre-existing rows didn't carry this — coerce to the default at
  // the wire boundary so callers always see a concrete policy.
  joinPolicy?: SpaceJoinPolicy | null;
  createdAt: number;
  updatedAt: number;
};
function toSpace(doc: SpaceLean): Space {
  return {
    id: doc._id,
    name: doc.name,
    ownerId: doc.ownerId,
    joinPolicy: doc.joinPolicy ?? "open",
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

type JoinRequestLean = {
  _id: string;
  spaceId: string;
  code: string;
  requester: {
    kind: "user" | "guest";
    userId?: string | null;
    username?: string | null;
    displayName?: string | null;
  };
  status: JoinRequestStatus;
  requestedAt: number;
  expiresAt: Date;
  approvedSessionToken?: string | null;
};
function toJoinRequest(doc: JoinRequestLean): JoinRequest {
  const requester: JoinRequester =
    doc.requester.kind === "user"
      ? {
          kind: "user",
          userId: doc.requester.userId ?? "",
          username: doc.requester.username ?? "",
          displayName: doc.requester.displayName ?? null,
        }
      : { kind: "guest", displayName: doc.requester.displayName ?? "" };
  return {
    id: doc._id,
    spaceId: doc.spaceId,
    code: doc.code,
    requester,
    status: doc.status,
    requestedAt: doc.requestedAt,
    expiresAt: doc.expiresAt.getTime(),
    approvedSessionToken: doc.approvedSessionToken ?? null,
  };
}

type SpaceMemberLean = {
  spaceId: string;
  userId: string;
  username: string;
  // Mongoose infers `default: null` fields as nullable-or-missing. The
  // converter coerces `?? null`, so accept either shape here.
  displayName?: string | null;
  timezone?: string | null;
  city?: string | null;
  role: SpaceRole;
  joinedAt: number;
};
function toMember(doc: SpaceMemberLean): SpaceMember {
  return {
    spaceId: doc.spaceId,
    userId: doc.userId,
    username: doc.username,
    displayName: doc.displayName ?? null,
    timezone: doc.timezone ?? null,
    city: doc.city ?? null,
    role: doc.role,
    joinedAt: doc.joinedAt,
  };
}

type InviteLean = {
  _id: string;
  spaceId: string;
  createdBy: string;
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
    usesRemaining: doc.usesRemaining ?? null,
    expiresAt: doc.expiresAt ?? null,
    createdAt: doc.createdAt,
  };
}

type ChatMomentLean = {
  videoUrl?: string;
  currentTime?: number;
  mediaTitle?: string | null;
  collectionId?: string | null;
  collectionIndex?: number | null;
};
type ChatMessageLean = {
  _id: string;
  spaceId: string;
  senderId: string;
  senderKind: string;
  senderName: string;
  text?: string;
  moment?: ChatMomentLean | null;
  sentAt: number;
};
function toChatMessage(doc: ChatMessageLean): ChatMessage {
  return {
    id: doc._id,
    spaceId: doc.spaceId,
    senderId: doc.senderId,
    senderKind: doc.senderKind === "guest" ? "guest" : "user",
    senderName: doc.senderName,
    text: doc.text ?? "",
    moment:
      doc.moment && typeof doc.moment.videoUrl === "string" && typeof doc.moment.currentTime === "number"
        ? {
            videoUrl: doc.moment.videoUrl,
            currentTime: doc.moment.currentTime,
            mediaTitle: doc.moment.mediaTitle ?? "",
            collectionId: doc.moment.collectionId ?? null,
            collectionIndex: doc.moment.collectionIndex ?? null,
          }
        : null,
    sentAt: doc.sentAt,
  };
}

type ShareLinkLean = {
  _id: string;
  spaceId: string;
  createdBy: string;
  label?: string;
  targetKind: string;
  targetUrl?: string | null;
  targetTitle?: string | null;
  targetCollectionId?: string | null;
  passcodeHash?: string | null;
  expiresAt?: number | null;
  maxAccesses?: number | null;
  accessCount?: number;
  disabled?: boolean;
  createdAt: number;
  lastAccessedAt?: number | null;
};
function toShareLink(doc: ShareLinkLean): ShareLink {
  return {
    id: doc._id,
    spaceId: doc.spaceId,
    createdBy: doc.createdBy,
    label: doc.label ?? "",
    targetKind: doc.targetKind === "collection" ? "collection" : "url",
    targetUrl: doc.targetUrl ?? null,
    targetTitle: doc.targetTitle ?? null,
    targetCollectionId: doc.targetCollectionId ?? null,
    hasPasscode: typeof doc.passcodeHash === "string" && doc.passcodeHash.length > 0,
    expiresAt: doc.expiresAt ?? null,
    maxAccesses: doc.maxAccesses ?? null,
    accessCount: doc.accessCount ?? 0,
    disabled: doc.disabled ?? false,
    createdAt: doc.createdAt,
    lastAccessedAt: doc.lastAccessedAt ?? null,
  };
}
function toStoredShareLink(doc: ShareLinkLean): StoredShareLink {
  return { ...toShareLink(doc), passcodeHash: doc.passcodeHash ?? null };
}

type ShareAccessLean = {
  _id: string;
  shareId: string;
  ip?: string;
  userAgent?: string;
  accessedAt: number;
};
function toShareAccess(doc: ShareAccessLean): ShareAccess {
  return { id: doc._id, ip: doc.ip ?? "", userAgent: doc.userAgent ?? "", accessedAt: doc.accessedAt };
}

// ──────────────────────────────────────────────────────────────────────
// Helpers

// Coerce collection items to a clean, de-duplicated list — trims URLs,
// drops blanks, and keeps the first occurrence of each URL.
function normalizeCollectionItems(items: CollectionItem[]): CollectionItem[] {
  const seen = new Set<string>();
  const out: CollectionItem[] = [];
  for (const it of items) {
    if (!it || typeof it.url !== "string") continue;
    const url = it.url.trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push({ url, name: typeof it.name === "string" ? it.name.trim() : "" });
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
