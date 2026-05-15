import { MongoClient, type Collection, type Db } from "mongodb";

import type { InviteCode, InviteKind, PairingCode, Playlist, Space, SpaceMember, SpaceRole, StorageConfig, Subtitle, Video } from "@/protocol.ts";
import type {
  InviteRepo,
  MembershipRepo,
  PairingRepo,
  PlaylistRepo,
  Session,
  SessionRepo,
  SpaceRepo,
  Storage,
  StorageConfigRepo,
  StoredUser,
  UserRepo,
  VideoRepo,
} from "@/storage/types.ts";
import { decrypt, encrypt } from "@/crypto.ts";

// Document shapes as stored in Mongo. _id is the same string as the public
// id — we generate our own (random short slugs) rather than using ObjectId
// so the wire format stays string-keyed and URL-safe.
type VideoDoc = {
  _id: string;
  spaceId: string;
  addedBy: string;
  url: string;
  title: string;
  subtitles: Subtitle[];
  addedAt: number;
  updatedAt: number;
};

type UserDoc = {
  _id: string;
  username: string;
  usernameLower: string;
  passwordHash: string;
  // Optional display label; null is the wire-equivalent of "use @username".
  displayName: string | null;
  isAdmin: boolean;
  createdAt: number;
};

type SessionDoc = {
  _id: string; // session token
  userId: string | null;
  currentSpaceId: string | null;
  guestDisplayName: string | null;
  createdAt: number;
  expiresAt: Date; // Date for TTL index
};

type StorageConfigDoc = {
  _id: string; // spaceId — one config per space
  provider: "r2";
  accountId: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKeyEnc: string;
  publicBaseUrl?: string;
  maxBytes: number;
  label?: string;
  updatedAt: number;
};

type PlaylistDoc = {
  _id: string;
  spaceId: string;
  createdBy: string;
  title: string;
  videoIds: string[];
  createdAt: number;
  updatedAt: number;
};

type SpaceDoc = {
  _id: string;
  name: string;
  ownerId: string;
  createdAt: number;
  updatedAt: number;
};

type MemberDoc = {
  _id: string;
  spaceId: string;
  userId: string;
  username: string;
  displayName: string | null;
  role: SpaceRole;
  joinedAt: number;
};

type InviteDoc = {
  _id: string; // the code
  spaceId: string;
  createdBy: string;
  kind: InviteKind;
  usesRemaining: number | null;
  expiresAt: number | null;
  createdAt: number;
};

type PairingDoc = {
  _id: string; // the 8-digit code
  displayName: string;
  status: "pending" | "approved";
  spaceId: string | null;
  spaceName: string | null;
  sessionToken: string | null;
  createdAt: number;
  expiresAt: Date; // Date so the TTL index expires the doc automatically
};

function randomId(): string {
  return Math.random().toString(36).slice(2, 10);
}

// Connect, create indexes, return a closeable Storage.
export async function createMongoStorage(mongoUrl: string): Promise<Storage> {
  const client = new MongoClient(mongoUrl);
  await client.connect();
  // If MONGO_URL includes a default DB, use it; otherwise fall back to "roomflix".
  const dbName = new URL(mongoUrl).pathname.replace(/^\//, "") || "roomflix";
  const db: Db = client.db(dbName);

  const videos = db.collection<VideoDoc>("videos");
  const users = db.collection<UserDoc>("users");
  const sessions = db.collection<SessionDoc>("sessions");
  const storageConfigs = db.collection<StorageConfigDoc>("storage_configs");
  const playlists = db.collection<PlaylistDoc>("playlists");
  const spaces = db.collection<SpaceDoc>("spaces");
  const members = db.collection<MemberDoc>("space_members");
  const invites = db.collection<InviteDoc>("invite_codes");
  const pairings = db.collection<PairingDoc>("pairing_codes");

  await Promise.all([
    videos.createIndex({ spaceId: 1 }),
    videos.createIndex({ spaceId: 1, url: 1 }, { unique: true, sparse: true }),
    users.createIndex({ usernameLower: 1 }, { unique: true }),
    // TTL: Mongo expires the doc once `expiresAt` is in the past.
    sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    sessions.createIndex({ userId: 1 }),
    playlists.createIndex({ spaceId: 1, createdAt: -1 }),
    spaces.createIndex({ ownerId: 1 }),
    members.createIndex({ spaceId: 1, userId: 1 }, { unique: true }),
    members.createIndex({ userId: 1 }),
    invites.createIndex({ spaceId: 1 }),
    // TTL on pairing codes too — abandoned codes get reaped automatically.
    pairings.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
  ]);

  return {
    videos: new MongoVideoRepo(videos),
    users: new MongoUserRepo(users),
    sessions: new MongoSessionRepo(sessions),
    storageConfigs: new MongoStorageConfigRepo(storageConfigs),
    playlists: new MongoPlaylistRepo(playlists),
    spaces: new MongoSpaceRepo(spaces),
    memberships: new MongoMembershipRepo(members),
    invites: new MongoInviteRepo(invites),
    pairings: new MongoPairingRepo(pairings),
    async close() {
      await client.close();
    },
  };
}

class MongoVideoRepo implements VideoRepo {
  constructor(private col: Collection<VideoDoc>) {}

  async list(spaceId: string): Promise<Video[]> {
    const docs = await this.col.find({ spaceId }).sort({ addedAt: -1 }).toArray();
    return docs.map(toVideo);
  }

  async get(spaceId: string, id: string): Promise<Video | null> {
    const doc = await this.col.findOne({ _id: id, spaceId });
    return doc ? toVideo(doc) : null;
  }

  async findByUrl(spaceId: string, url: string): Promise<Video | null> {
    const doc = await this.col.findOne({ spaceId, url: url.trim() });
    return doc ? toVideo(doc) : null;
  }

  async create(input: { spaceId: string; addedBy: string; url: string; title?: string; subtitles?: Subtitle[] }): Promise<Video> {
    const url = input.url.trim();
    const existing = await this.findByUrl(input.spaceId, url);
    if (existing) return existing;

    const now = Date.now();
    const doc: VideoDoc = {
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
      await this.col.insertOne(doc);
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
    const existing = await this.col.findOne({ _id: id, spaceId });
    if (!existing) return null;

    const nextUrl = patch.url !== undefined ? patch.url.trim() : existing.url;
    const nextTitle =
      patch.title !== undefined
        ? patch.title.trim() || defaultTitleFromUrl(nextUrl)
        : existing.title === existing.url || existing.title === defaultTitleFromUrl(existing.url)
          ? defaultTitleFromUrl(nextUrl)
          : existing.title;

    const update: Partial<VideoDoc> = {
      url: nextUrl,
      title: nextTitle,
      updatedAt: Date.now(),
    };
    if (patch.subtitles !== undefined) {
      update.subtitles = patch.subtitles.map(normalizeSubtitle);
    }

    const result = await this.col.findOneAndUpdate({ _id: id, spaceId }, { $set: update }, { returnDocument: "after" });
    return result ? toVideo(result) : null;
  }

  async remove(spaceId: string, id: string): Promise<boolean> {
    const result = await this.col.deleteOne({ _id: id, spaceId });
    return result.deletedCount === 1;
  }

  async reparent(oldOwnerId: string, spaceId: string): Promise<number> {
    // Legacy rows stored `ownerId`; new rows use `spaceId`. Set the new
    // field and unset the old in one pass.
    const result = await this.col.updateMany(
      { ownerId: oldOwnerId },
      { $set: { spaceId, addedBy: oldOwnerId }, $unset: { ownerId: "" } },
    );
    return result.modifiedCount;
  }
}

class MongoUserRepo implements UserRepo {
  constructor(private col: Collection<UserDoc>) {}

  async findByUsername(username: string): Promise<StoredUser | null> {
    const doc = await this.col.findOne({ usernameLower: username.toLowerCase() });
    return doc ? toStoredUser(doc) : null;
  }

  async findById(id: string): Promise<StoredUser | null> {
    const doc = await this.col.findOne({ _id: id });
    return doc ? toStoredUser(doc) : null;
  }

  async create(input: { username: string; passwordHash: string; isAdmin: boolean }): Promise<StoredUser> {
    const doc: UserDoc = {
      _id: randomId(),
      username: input.username,
      usernameLower: input.username.toLowerCase(),
      passwordHash: input.passwordHash,
      displayName: null,
      isAdmin: input.isAdmin,
      createdAt: Date.now(),
    };
    await this.col.insertOne(doc);
    return toStoredUser(doc);
  }

  async count(): Promise<number> {
    return this.col.estimatedDocumentCount();
  }

  async listAll(): Promise<StoredUser[]> {
    const docs = await this.col.find({}).toArray();
    return docs.map(toStoredUser);
  }

  async updateProfile(id: string, patch: { displayName?: string | null }): Promise<StoredUser | null> {
    const set: Partial<UserDoc> = {};
    if (patch.displayName !== undefined) set.displayName = patch.displayName;
    if (Object.keys(set).length === 0) {
      // Nothing to do — return the current row so callers always get back
      // the canonical post-update shape.
      const existing = await this.col.findOne({ _id: id });
      return existing ? toStoredUser(existing) : null;
    }
    const result = await this.col.findOneAndUpdate({ _id: id }, { $set: set }, { returnDocument: "after" });
    return result ? toStoredUser(result) : null;
  }
}

class MongoSessionRepo implements SessionRepo {
  constructor(private col: Collection<SessionDoc>) {}

  async create(input: { token: string; userId: string | null; currentSpaceId: string | null; guestDisplayName: string | null; expiresAt: number }): Promise<Session> {
    const doc: SessionDoc = {
      _id: input.token,
      userId: input.userId,
      currentSpaceId: input.currentSpaceId,
      guestDisplayName: input.guestDisplayName,
      createdAt: Date.now(),
      expiresAt: new Date(input.expiresAt),
    };
    await this.col.insertOne(doc);
    return toSession(doc);
  }

  async findByToken(token: string): Promise<Session | null> {
    const doc = await this.col.findOne({ _id: token });
    if (!doc) return null;
    if (doc.expiresAt.getTime() < Date.now()) {
      await this.col.deleteOne({ _id: token }).catch(() => undefined);
      return null;
    }
    return toSession(doc);
  }

  async setCurrentSpace(token: string, spaceId: string | null): Promise<void> {
    await this.col.updateOne({ _id: token }, { $set: { currentSpaceId: spaceId } });
  }

  async setGuestDisplayName(token: string, displayName: string): Promise<void> {
    await this.col.updateOne({ _id: token }, { $set: { guestDisplayName: displayName } });
  }

  async deleteByToken(token: string): Promise<boolean> {
    const result = await this.col.deleteOne({ _id: token });
    return result.deletedCount === 1;
  }
}

class MongoStorageConfigRepo implements StorageConfigRepo {
  constructor(private col: Collection<StorageConfigDoc>) {}

  async get(spaceId: string): Promise<StorageConfig | null> {
    const doc = await this.col.findOne({ _id: spaceId });
    return doc ? toStorageConfig(doc) : null;
  }

  async put(spaceId: string, input: Omit<StorageConfig, "updatedAt">): Promise<StorageConfig> {
    const now = Date.now();
    const doc: StorageConfigDoc = {
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
    await this.col.replaceOne({ _id: spaceId }, doc, { upsert: true });
    return toStorageConfig(doc);
  }

  async remove(spaceId: string): Promise<boolean> {
    const result = await this.col.deleteOne({ _id: spaceId });
    return result.deletedCount === 1;
  }

  async reparentFromUser(oldUserId: string, spaceId: string): Promise<boolean> {
    // The old doc was keyed by userId; the new one is keyed by spaceId.
    // Read-copy-delete so we never lose the encrypted secret mid-flight.
    const existing = await this.col.findOne({ _id: oldUserId });
    if (!existing) return false;
    const next: StorageConfigDoc = { ...existing, _id: spaceId };
    await this.col.insertOne(next).catch(() => undefined); // tolerate re-run
    await this.col.deleteOne({ _id: oldUserId });
    return true;
  }
}

class MongoPlaylistRepo implements PlaylistRepo {
  constructor(private col: Collection<PlaylistDoc>) {}

  async list(spaceId: string): Promise<Playlist[]> {
    const docs = await this.col.find({ spaceId }).sort({ createdAt: -1 }).toArray();
    return docs.map(toPlaylist);
  }

  async get(spaceId: string, id: string): Promise<Playlist | null> {
    const doc = await this.col.findOne({ _id: id, spaceId });
    return doc ? toPlaylist(doc) : null;
  }

  async getById(id: string): Promise<Playlist | null> {
    const doc = await this.col.findOne({ _id: id });
    return doc ? toPlaylist(doc) : null;
  }

  async create(input: { spaceId: string; createdBy: string; title: string; videoIds: string[] }): Promise<Playlist> {
    const now = Date.now();
    const doc: PlaylistDoc = {
      _id: randomId(),
      spaceId: input.spaceId,
      createdBy: input.createdBy,
      title: input.title.trim() || "Untitled playlist",
      videoIds: dedupe(input.videoIds),
      createdAt: now,
      updatedAt: now,
    };
    await this.col.insertOne(doc);
    return toPlaylist(doc);
  }

  async update(spaceId: string, id: string, patch: { title?: string; videoIds?: string[] }): Promise<Playlist | null> {
    const set: Partial<PlaylistDoc> = { updatedAt: Date.now() };
    if (patch.title !== undefined) set.title = patch.title.trim() || "Untitled playlist";
    if (patch.videoIds !== undefined) set.videoIds = dedupe(patch.videoIds);

    const result = await this.col.findOneAndUpdate({ _id: id, spaceId }, { $set: set }, { returnDocument: "after" });
    return result ? toPlaylist(result) : null;
  }

  async remove(spaceId: string, id: string): Promise<boolean> {
    const result = await this.col.deleteOne({ _id: id, spaceId });
    return result.deletedCount === 1;
  }

  async reparent(oldOwnerId: string, spaceId: string): Promise<number> {
    const result = await this.col.updateMany(
      { ownerId: oldOwnerId },
      { $set: { spaceId, createdBy: oldOwnerId }, $unset: { ownerId: "" } },
    );
    return result.modifiedCount;
  }
}

class MongoSpaceRepo implements SpaceRepo {
  constructor(private col: Collection<SpaceDoc>) {}

  async get(id: string): Promise<Space | null> {
    const doc = await this.col.findOne({ _id: id });
    return doc ? toSpace(doc) : null;
  }

  async create(input: { name: string; ownerId: string }): Promise<Space> {
    const now = Date.now();
    const doc: SpaceDoc = {
      _id: randomId(),
      name: input.name.trim() || "Untitled space",
      ownerId: input.ownerId,
      createdAt: now,
      updatedAt: now,
    };
    await this.col.insertOne(doc);
    return toSpace(doc);
  }

  async update(id: string, patch: { name?: string }): Promise<Space | null> {
    const set: Partial<SpaceDoc> = { updatedAt: Date.now() };
    if (patch.name !== undefined) set.name = patch.name.trim() || "Untitled space";
    const result = await this.col.findOneAndUpdate({ _id: id }, { $set: set }, { returnDocument: "after" });
    return result ? toSpace(result) : null;
  }

  async remove(id: string): Promise<boolean> {
    const result = await this.col.deleteOne({ _id: id });
    return result.deletedCount === 1;
  }
}

class MongoMembershipRepo implements MembershipRepo {
  constructor(private col: Collection<MemberDoc>) {}

  async add(input: { spaceId: string; userId: string; username: string; role: SpaceRole; displayName?: string | null }): Promise<SpaceMember> {
    const existing = await this.col.findOne({ spaceId: input.spaceId, userId: input.userId });
    if (existing) return toMember(existing);
    const doc: MemberDoc = {
      _id: randomId(),
      spaceId: input.spaceId,
      userId: input.userId,
      username: input.username,
      displayName: input.displayName ?? null,
      role: input.role,
      joinedAt: Date.now(),
    };
    await this.col.insertOne(doc);
    return toMember(doc);
  }

  async remove(spaceId: string, userId: string): Promise<boolean> {
    const result = await this.col.deleteOne({ spaceId, userId });
    return result.deletedCount === 1;
  }

  async get(spaceId: string, userId: string): Promise<SpaceMember | null> {
    const doc = await this.col.findOne({ spaceId, userId });
    return doc ? toMember(doc) : null;
  }

  async listForSpace(spaceId: string): Promise<SpaceMember[]> {
    const docs = await this.col.find({ spaceId }).sort({ joinedAt: 1 }).toArray();
    return docs.map(toMember);
  }

  async listForUser(userId: string): Promise<SpaceMember[]> {
    const docs = await this.col.find({ userId }).sort({ joinedAt: 1 }).toArray();
    return docs.map(toMember);
  }

  async removeAllForSpace(spaceId: string): Promise<number> {
    const result = await this.col.deleteMany({ spaceId });
    return result.deletedCount;
  }

  async updateDisplayNameForUser(userId: string, displayName: string | null): Promise<number> {
    const result = await this.col.updateMany({ userId }, { $set: { displayName } });
    return result.modifiedCount;
  }
}

class MongoInviteRepo implements InviteRepo {
  constructor(private col: Collection<InviteDoc>) {}

  async create(input: { spaceId: string; createdBy: string; kind: InviteKind; usesRemaining: number | null; expiresAt: number | null }): Promise<InviteCode> {
    const doc: InviteDoc = {
      _id: generateInviteCode(),
      spaceId: input.spaceId,
      createdBy: input.createdBy,
      kind: input.kind,
      usesRemaining: input.usesRemaining,
      expiresAt: input.expiresAt,
      createdAt: Date.now(),
    };
    await this.col.insertOne(doc);
    return toInvite(doc);
  }

  async get(code: string): Promise<InviteCode | null> {
    const doc = await this.col.findOne({ _id: code });
    return doc ? toInvite(doc) : null;
  }

  async listForSpace(spaceId: string): Promise<InviteCode[]> {
    const docs = await this.col.find({ spaceId }).sort({ createdAt: -1 }).toArray();
    return docs.map(toInvite);
  }

  async remove(code: string): Promise<boolean> {
    const result = await this.col.deleteOne({ _id: code });
    return result.deletedCount === 1;
  }

  async consume(code: string): Promise<InviteCode | null> {
    const existing = await this.col.findOne({ _id: code });
    if (!existing) return null;
    // Reject expired codes outright — even if uses remain.
    if (existing.expiresAt !== null && existing.expiresAt < Date.now()) return null;
    if (existing.usesRemaining === null) return toInvite(existing);
    if (existing.usesRemaining <= 0) return null;
    const result = await this.col.findOneAndUpdate(
      { _id: code, usesRemaining: { $gt: 0 } },
      { $inc: { usesRemaining: -1 } },
      { returnDocument: "after" },
    );
    return result ? toInvite(result) : null;
  }

  async removeAllForSpace(spaceId: string): Promise<number> {
    const result = await this.col.deleteMany({ spaceId });
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
  constructor(private col: Collection<PairingDoc>) {}

  async create(input: { displayName: string; ttlMs: number }): Promise<PairingCode> {
    // Retry on collision — 10^8 is plenty of space at the scale we target,
    // but the loop is cheap insurance against the rare clash.
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generatePairingCode();
      const now = Date.now();
      const doc: PairingDoc = {
        _id: code,
        displayName: input.displayName,
        status: "pending",
        spaceId: null,
        spaceName: null,
        sessionToken: null,
        createdAt: now,
        expiresAt: new Date(now + input.ttlMs),
      };
      try {
        await this.col.insertOne(doc);
        return toPairing(doc);
      } catch (err) {
        if (!isDuplicateKey(err)) throw err;
        // collision — pick a new code and try again
      }
    }
    throw new Error("could not allocate a pairing code; please retry");
  }

  async get(code: string): Promise<PairingCode | null> {
    const doc = await this.col.findOne({ _id: code });
    if (!doc) return null;
    if (doc.expiresAt.getTime() < Date.now()) {
      // TTL index hasn't reaped it yet — treat as gone.
      await this.col.deleteOne({ _id: code }).catch(() => undefined);
      return null;
    }
    return toPairing(doc);
  }

  async approve(code: string, input: { spaceId: string; spaceName: string; sessionToken: string }): Promise<PairingCode | null> {
    // Atomic: only flip if still pending and not yet expired.
    const result = await this.col.findOneAndUpdate(
      { _id: code, status: "pending", expiresAt: { $gt: new Date() } },
      { $set: { status: "approved", spaceId: input.spaceId, spaceName: input.spaceName, sessionToken: input.sessionToken } },
      { returnDocument: "after" },
    );
    return result ? toPairing(result) : null;
  }

  async consume(code: string): Promise<boolean> {
    const result = await this.col.deleteOne({ _id: code });
    return result.deletedCount === 1;
  }
}

// Pure-numeric 8-digit pairing code. Displayed to the guest as XXXX XXXX —
// easy to read aloud over a phone, easy to type back on the admin side.
function generatePairingCode(): string {
  let out = "";
  for (let i = 0; i < 8; i++) {
    out += Math.floor(Math.random() * 10).toString();
  }
  return out;
}

function toVideo(doc: VideoDoc): Video {
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

function toStoredUser(doc: UserDoc): StoredUser {
  return {
    id: doc._id,
    username: doc.username,
    // Pre-Phase-4-bis records may not have displayName persisted yet; coerce
    // the missing field to null so downstream consumers don't see undefined.
    displayName: doc.displayName ?? null,
    passwordHash: doc.passwordHash,
    isAdmin: doc.isAdmin,
    createdAt: doc.createdAt,
  };
}

function toSession(doc: SessionDoc): Session {
  return {
    token: doc._id,
    // Legacy docs may have userId as a non-null string but no guest fields,
    // or (post-guest-feature) any combination. Coerce missing keys to null.
    userId: doc.userId ?? null,
    currentSpaceId: doc.currentSpaceId,
    guestDisplayName: doc.guestDisplayName ?? null,
    createdAt: doc.createdAt,
    expiresAt: doc.expiresAt.getTime(),
  };
}

function toStorageConfig(doc: StorageConfigDoc): StorageConfig {
  return {
    provider: doc.provider,
    accountId: doc.accountId,
    bucket: doc.bucket,
    accessKeyId: doc.accessKeyId,
    secretAccessKey: decrypt(doc.secretAccessKeyEnc),
    publicBaseUrl: doc.publicBaseUrl,
    maxBytes: doc.maxBytes,
    label: doc.label,
    updatedAt: doc.updatedAt,
  };
}

function toPlaylist(doc: PlaylistDoc): Playlist {
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

function toSpace(doc: SpaceDoc): Space {
  return {
    id: doc._id,
    name: doc.name,
    ownerId: doc.ownerId,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function toMember(doc: MemberDoc): SpaceMember {
  return {
    spaceId: doc.spaceId,
    userId: doc.userId,
    username: doc.username,
    displayName: doc.displayName ?? null,
    role: doc.role,
    joinedAt: doc.joinedAt,
  };
}

function toInvite(doc: InviteDoc): InviteCode {
  return {
    code: doc._id,
    spaceId: doc.spaceId,
    createdBy: doc.createdBy,
    // Legacy codes pre-date the kind/expiresAt fields. Default kind to
    // "member" so existing rows keep their old semantics; null expiry
    // means they never expire (consistent with old behavior).
    kind: doc.kind ?? "member",
    usesRemaining: doc.usesRemaining,
    expiresAt: doc.expiresAt ?? null,
    createdAt: doc.createdAt,
  };
}

function toPairing(doc: PairingDoc): PairingCode {
  return {
    code: doc._id,
    displayName: doc.displayName,
    status: doc.status,
    spaceId: doc.spaceId,
    spaceName: doc.spaceName,
    sessionToken: doc.sessionToken,
    createdAt: doc.createdAt,
    expiresAt: doc.expiresAt.getTime(),
  };
}

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
