// Storage abstraction. The rest of the server depends only on these
// interfaces, so swapping the impl for a different backend is a matter of
// writing a new implementation and pointing the factory in ./index.ts at it
// — no changes elsewhere.
import type {
  AuthUser,
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

// VideoRepo entries belong to a space. The route layer resolves the
// caller's current space + role, the repo enforces the spaceId on writes.
export interface VideoRepo {
  list(spaceId: string): Promise<Video[]>;
  get(spaceId: string, id: string): Promise<Video | null>;
  findByUrl(spaceId: string, url: string): Promise<Video | null>;
  // Idempotent on (spaceId, url): returns the existing video if one with the
  // same url already exists in this space. A SQL impl would back this with
  // a UNIQUE(spaceId, url) constraint.
  create(input: { spaceId: string; addedBy: string; url: string; title?: string; subtitles?: Subtitle[] }): Promise<Video>;
  update(spaceId: string, id: string, patch: { url?: string; title?: string; subtitles?: Subtitle[] }): Promise<Video | null>;
  remove(spaceId: string, id: string): Promise<boolean>;
  // Migration helper: reparent every doc currently keyed under `oldOwnerId`
  // (legacy field) to the given spaceId. Used once during Phase-4 boot
  // migration. Returns the count of docs touched.
  reparent(oldOwnerId: string, spaceId: string): Promise<number>;
}

// Persisted user record. passwordHash never leaves the server; AuthUser is
// the shape that gets serialized to clients.
export type StoredUser = AuthUser & {
  passwordHash: string;
};

export interface UserRepo {
  findByUsername(username: string): Promise<StoredUser | null>;
  findById(id: string): Promise<StoredUser | null>;
  create(input: { username: string; passwordHash: string; isAdmin: boolean }): Promise<StoredUser>;
  count(): Promise<number>;
  // Returns every user — used by the boot migration to find users missing a
  // space membership. Bounded scan; this app's user count stays small.
  listAll(): Promise<StoredUser[]>;
  // Patch user-editable profile fields. Currently just displayName; the
  // shape is left open so we can extend without changing call sites.
  updateProfile(id: string, patch: { displayName?: string | null }): Promise<StoredUser | null>;
}

// Sessions back the cookie. A session is EITHER tied to a real user
// (userId set, guestDisplayName null) OR represents a guest joined via
// an invite code (userId null, guestDisplayName set, currentSpaceId
// locked to the invite's space).
export type Session = {
  token: string;
  userId: string | null;
  // Currently-active space for this session. For users: changeable via
  // PUT /api/session/space. For guests: locked to the inviting space.
  currentSpaceId: string | null;
  // Set for guest sessions; updateable by the guest's own profile edit.
  guestDisplayName: string | null;
  createdAt: number;
  expiresAt: number;
};

export interface SessionRepo {
  create(input: { token: string; userId: string | null; currentSpaceId: string | null; guestDisplayName: string | null; expiresAt: number }): Promise<Session>;
  findByToken(token: string): Promise<Session | null>;
  setCurrentSpace(token: string, spaceId: string | null): Promise<void>;
  setGuestDisplayName(token: string, displayName: string): Promise<void>;
  deleteByToken(token: string): Promise<boolean>;
}

// DEPRECATED — backed by the legacy `storage_configs` collection. Kept
// alive only for the boot migration that reads each row, creates a new
// storage_connections row, and auto-activates it in the user's home
// space. After migration completes nothing else should touch this.
export interface StorageConfigRepo {
  get(spaceId: string): Promise<StorageConfig | null>;
  put(spaceId: string, input: Omit<StorageConfig, "updatedAt">): Promise<StorageConfig>;
  remove(spaceId: string): Promise<boolean>;
  // Yields every legacy doc that hasn't been migrated yet. The boot
  // migration calls this, processes each, then calls markMigrated so a
  // re-run is a no-op.
  listUnmigrated(): Promise<Array<StorageConfig & { _legacyKey: string }>>;
  markMigrated(legacyKey: string): Promise<boolean>;
}

// Account-level storage credentials. Owned by a single user; secrets
// are encrypted at rest. The repo never returns plaintext via the
// regular list/get; getSecret() exposes it only when the caller has
// authorization to use the credential.
export interface StorageConnectionRepo {
  // List every connection owned by this user (no secrets).
  listForOwner(ownerId: string): Promise<StorageConnection[]>;
  // Single connection lookup. Returns null when not found.
  get(id: string): Promise<StorageConnection | null>;
  // Many-by-id, used to hydrate a per-space derived view efficiently.
  getMany(ids: string[]): Promise<StorageConnection[]>;
  // Cleartext secret access key. Caller is responsible for permission
  // checks (owner or has a grant). Separate from get() so casual list
  // routes never accidentally surface it.
  getSecret(id: string): Promise<string | null>;
  create(input: {
    ownerId: string;
    label: string;
    provider: StorageProvider;
    accountId: string;
    bucket: string;
    accessKeyId: string;
    secretAccessKey: string;
    publicBaseUrl?: string;
    maxBytes: number;
  }): Promise<StorageConnection>;
  // Partial update. Pass secretAccessKey to rotate the cred; omit to
  // keep the existing encrypted value.
  update(
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
  ): Promise<StorageConnection | null>;
  remove(id: string): Promise<boolean>;
}

// Per-(connection, space) marker that a connection is exposed in a
// space. Caller (the route layer) enforces the invariant that the
// space's owner is also the connection's owner before adding.
export interface StorageActivationRepo {
  listForOwner(ownerId: string): Promise<StorageActivation[]>;
  listForSpace(spaceId: string): Promise<StorageActivation[]>;
  listForConnection(connectionId: string): Promise<StorageActivation[]>;
  // Upsert. When the row already exists, openToGuests is updated; the
  // activatedAt timestamp is preserved on re-activate.
  add(input: { connectionId: string; spaceId: string; openToGuests?: boolean }): Promise<StorageActivation>;
  remove(connectionId: string, spaceId: string): Promise<boolean>;
  // Cascade helpers — called when a connection or space is deleted.
  removeAllForConnection(connectionId: string): Promise<number>;
  removeAllForSpace(spaceId: string): Promise<number>;
}


// Per-space ordered playlists of library video IDs. Membership is stored
// as ids rather than embedded videos so the playlist stays in sync with
// library edits — the API hydrates ids to full Video records at read time.
export interface PlaylistRepo {
  list(spaceId: string): Promise<Playlist[]>;
  get(spaceId: string, id: string): Promise<Playlist | null>;
  // Used by the room handler — the room is loaded by an authenticated
  // user, but the lookup must work for any space member who hits
  // next/prev/jumpTo regardless of who originally loaded the playlist.
  getById(id: string): Promise<Playlist | null>;
  create(input: { spaceId: string; createdBy: string; title: string; videoIds: string[] }): Promise<Playlist>;
  update(spaceId: string, id: string, patch: { title?: string; videoIds?: string[] }): Promise<Playlist | null>;
  remove(spaceId: string, id: string): Promise<boolean>;
  reparent(oldOwnerId: string, spaceId: string): Promise<number>;
}

// Spaces themselves: name + owner. Membership lives in MembershipRepo.
export interface SpaceRepo {
  get(id: string): Promise<Space | null>;
  create(input: { name: string; ownerId: string }): Promise<Space>;
  update(id: string, patch: { name?: string }): Promise<Space | null>;
  remove(id: string): Promise<boolean>;
}

// Per-user space membership. The (spaceId, userId) pair is unique. Role
// distinguishes owner from member; future roles can extend the union.
export interface MembershipRepo {
  add(input: { spaceId: string; userId: string; username: string; displayName?: string | null; role: SpaceRole }): Promise<SpaceMember>;
  remove(spaceId: string, userId: string): Promise<boolean>;
  get(spaceId: string, userId: string): Promise<SpaceMember | null>;
  listForSpace(spaceId: string): Promise<SpaceMember[]>;
  listForUser(userId: string): Promise<SpaceMember[]>;
  // Delete every membership row tied to a space — called when a space is
  // deleted so users don't end up pointing at a phantom space.
  removeAllForSpace(spaceId: string): Promise<number>;
  // Fan out a denormalized profile change (displayName) to every membership
  // row the user has. Returns the count of touched rows.
  updateDisplayNameForUser(userId: string, displayName: string | null): Promise<number>;
}

// Short, human-shareable codes that grant access when redeemed.
export interface InviteRepo {
  create(input: { spaceId: string; createdBy: string; kind: InviteKind; usesRemaining: number | null; expiresAt: number | null }): Promise<InviteCode>;
  get(code: string): Promise<InviteCode | null>;
  listForSpace(spaceId: string): Promise<InviteCode[]>;
  remove(code: string): Promise<boolean>;
  // Decrement usesRemaining (or no-op if it was already null = unlimited).
  // Also rejects when the code has expired. Caller coordinates serially
  // so two near-simultaneous redemptions don't both succeed past the cap.
  consume(code: string): Promise<InviteCode | null>;
  removeAllForSpace(spaceId: string): Promise<number>;
}

// Short-lived "I want to join" tickets for the TV-pairing guest flow.
// The collection has a TTL index on expiresAt so abandoned codes get
// reaped automatically.
export interface PairingRepo {
  create(input: { displayName: string; ttlMs: number }): Promise<PairingCode>;
  get(code: string): Promise<PairingCode | null>;
  // Mark a pending pairing approved. Returns the freshly-updated row, or
  // null if the code is unknown, already approved, or expired.
  approve(code: string, input: { spaceId: string; spaceName: string; sessionToken: string }): Promise<PairingCode | null>;
  // Used after the guest's status poll picked up the approved code — we
  // delete the record so the same code can't be replayed.
  consume(code: string): Promise<boolean>;
}

export type Storage = {
  videos: VideoRepo;
  users: UserRepo;
  sessions: SessionRepo;
  // Legacy — only the boot migration reads from this. Use storageConnections
  // for everything else.
  storageConfigs: StorageConfigRepo;
  storageConnections: StorageConnectionRepo;
  storageActivations: StorageActivationRepo;
  playlists: PlaylistRepo;
  spaces: SpaceRepo;
  memberships: MembershipRepo;
  invites: InviteRepo;
  pairings: PairingRepo;
  // Lifecycle hook so the server can disconnect cleanly on shutdown.
  close(): Promise<void>;
};
