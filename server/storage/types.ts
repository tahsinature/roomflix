// Storage abstraction. The rest of the server depends only on these
// interfaces, so swapping the impl for a different backend is a matter of
// writing a new implementation and pointing the factory in ./index.ts at it
// — no changes elsewhere.
import type {
  AuthUser,
  Collection,
  CollectionItem,
  CollectionMediaFilter,
  InviteCode,
  ChatMessage,
  ChatMoment,
  CollectionSource,
  JoinRequest,
  JoinRequester,
  RecentTitleItem,
  ShareAccess,
  ShareLink,
  ShareTargetKind,
  SessionState,
  WatchHistoryEntry,
  Space,
  SpaceJoinPolicy,
  SpaceMember,
  SpaceRole,
  StorageActivation,
  StorageConfig,
  StorageConnection,
  Subtitle,
  TitleLibraryItem,
  TitleLibraryStatus,
  UserPreferencesPatch,
  DiscoverMediaType,
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

export type TitleLibraryInput = Omit<TitleLibraryItem, "id" | "userId" | "addedAt" | "updatedAt">;

export interface TitleLibraryRepo {
  list(userId: string, status?: TitleLibraryStatus): Promise<TitleLibraryItem[]>;
  get(userId: string, mediaType: DiscoverMediaType, tmdbId: number): Promise<TitleLibraryItem | null>;
  upsert(userId: string, input: TitleLibraryInput): Promise<TitleLibraryItem>;
  remove(userId: string, mediaType: DiscoverMediaType, tmdbId: number): Promise<boolean>;
}

export type RecentTitleInput = Omit<RecentTitleItem, "id" | "userId" | "lastViewedAt" | "viewCount">;

export interface RecentTitleRepo {
  list(userId: string, limit: number): Promise<RecentTitleItem[]>;
  record(userId: string, input: RecentTitleInput): Promise<RecentTitleItem>;
  removeAll(userId: string): Promise<number>;
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
  updateProfile(
    id: string,
    patch: { displayName?: string | null; timezone?: string | null; city?: string | null; homeBezelStyle?: "cinema" | "crt" | "minimal" | null },
  ): Promise<StoredUser | null>;
  updatePreferences(id: string, patch: UserPreferencesPatch): Promise<StoredUser | null>;
  // Replace the stored password hash. Called by the password-reset
  // confirm flow after the new password has already been hashed.
  updatePasswordHash(id: string, passwordHash: string): Promise<void>;
}

// One-use password-reset tokens. Plaintext storage is deliberate — see
// the model file. The repo just handles CRUD; the API layer enforces
// TTL + one-use semantics.
export interface PasswordResetRepo {
  add(input: { token: string; userId: string; expiresAt: number }): Promise<void>;
  get(token: string): Promise<{ token: string; userId: string; createdAt: number; expiresAt: number; usedAt: number | null } | null>;
  markUsed(token: string): Promise<void>;
  // Drop every outstanding token for a user — handy at confirm time
  // so a token leak can't be replayed once the password's changed.
  removeAllForUser(userId: string): Promise<number>;
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
  // Nuke every session belonging to a user — called after a password
  // reset so old sessions can't outlive the credential rotation.
  deleteAllForUser(userId: string): Promise<number>;
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
  create(
    input: {
      ownerId: string;
      label: string;
      bucket: string;
      accessKeyId: string;
      secretAccessKey: string;
      publicBaseUrl?: string;
      maxBytes: number;
    } & ({ provider: "r2"; accountId: string } | { provider: "s3"; region: string }),
  ): Promise<StorageConnection>;
  // Partial update. Pass secretAccessKey to rotate the cred; omit to
  // keep the existing encrypted value.
  update(
    id: string,
    patch: {
      label?: string;
      accountId?: string;
      region?: string;
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

// Per-space collections — ordered mixed-media lists. Items are stored
// inline (not Library refs), so a collection is self-contained: no
// hydration step at read time, and importing a folder of hundreds of
// files never floods the video library.
export interface CollectionRepo {
  list(spaceId: string): Promise<Collection[]>;
  get(spaceId: string, id: string): Promise<Collection | null>;
  // Used by the WS handler — the lookup must work for any space member
  // navigating a loaded collection, not just whoever loaded it.
  getById(id: string): Promise<Collection | null>;
  create(input: {
    spaceId: string;
    createdBy: string;
    title: string;
    items: CollectionItem[];
    source: CollectionSource | null;
    coverUrl?: string | null;
    mediaFilter?: CollectionMediaFilter | null;
  }): Promise<Collection>;
  // `coverUrl: null` / `mediaFilter: null` clear the field; omit to
  // leave alone. Mirrors the rest of the partial-update convention.
  update(
    spaceId: string,
    id: string,
    patch: { title?: string; items?: CollectionItem[]; coverUrl?: string | null; mediaFilter?: CollectionMediaFilter | null },
  ): Promise<Collection | null>;
  remove(spaceId: string, id: string): Promise<boolean>;
}

// Spaces themselves: name + owner + joinPolicy. Membership lives in
// MembershipRepo.
export interface SpaceRepo {
  get(id: string): Promise<Space | null>;
  create(input: { name: string; ownerId: string }): Promise<Space>;
  update(id: string, patch: { name?: string; joinPolicy?: SpaceJoinPolicy }): Promise<Space | null>;
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
  // Sync the denormalized location fields onto every space-member row
  // belonging to this user. Called by the profile patch when timezone
  // or city changes so member-list panels stay current without a
  // per-row user fetch.
  updateLocationForUser(userId: string, patch: { timezone?: string | null; city?: string | null }): Promise<number>;
}

// Short, human-shareable codes that grant access when redeemed.
export interface InviteRepo {
  create(input: { spaceId: string; createdBy: string; usesRemaining: number | null; expiresAt: number | null }): Promise<InviteCode>;
  get(code: string): Promise<InviteCode | null>;
  listForSpace(spaceId: string): Promise<InviteCode[]>;
  remove(code: string): Promise<boolean>;
  // Decrement usesRemaining (or no-op if it was already null = unlimited).
  // Also rejects when the code has expired. Caller coordinates serially
  // so two near-simultaneous redemptions don't both succeed past the cap.
  consume(code: string): Promise<InviteCode | null>;
  removeAllForSpace(spaceId: string): Promise<number>;
}

// Pending invite redemption when a space's joinPolicy = "approval".
// Created at request time; the admin approves/denies from the space
// settings UI; the joiner waits on a poll for status to flip.
export interface JoinRequestRepo {
  create(input: { spaceId: string; code: string; requester: JoinRequester; ttlMs: number }): Promise<JoinRequest>;
  get(id: string): Promise<JoinRequest | null>;
  listPendingForSpace(spaceId: string): Promise<JoinRequest[]>;
  // Mark a request approved + stash the session token (when guest) so
  // the waiting-room poll on the joiner's side picks up the new
  // cookie/identity on its next tick.
  approve(id: string, approvedSessionToken: string | null): Promise<JoinRequest | null>;
  // Terminal status update. `denied` for admin reject; `cancelled` for
  // the joiner backing out of the waiting room.
  setTerminalStatus(id: string, status: "denied" | "cancelled"): Promise<JoinRequest | null>;
  removeAllForSpace(spaceId: string): Promise<number>;
}

// Persisted share-link record. passcodeHash never leaves the server;
// ShareLink (the wire shape) carries `hasPasscode` instead.
export type StoredShareLink = ShareLink & { passcodeHash: string | null };

// Public share links — passcode-/expiry-gated pointers to a media URL or
// a collection, redeemed without a session. The code IS the credential,
// so getByCode is intentionally NOT space-scoped.
export interface ShareLinkRepo {
  listForSpace(spaceId: string): Promise<ShareLink[]>;
  get(spaceId: string, id: string): Promise<ShareLink | null>;
  // Public lookup — returns the internal record (incl. passcodeHash) so
  // the public route can verify the passcode.
  getByCode(code: string): Promise<StoredShareLink | null>;
  create(input: {
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
  }): Promise<ShareLink>;
  // Partial update. passcodeHash: undefined leaves it untouched, null
  // clears it, a string rotates it.
  update(
    spaceId: string,
    id: string,
    patch: { label?: string; disabled?: boolean; expiresAt?: number | null; maxAccesses?: number | null; passcodeHash?: string | null },
  ): Promise<ShareLink | null>;
  remove(spaceId: string, id: string): Promise<boolean>;
  // Atomically bump accessCount + stamp lastAccessedAt — called per open.
  recordAccess(code: string): Promise<void>;
  removeAllForSpace(spaceId: string): Promise<number>;
}

// Per-open access log for share links (IP, user-agent, timestamp).
export interface ShareAccessRepo {
  add(input: { shareId: string; ip: string; userAgent: string }): Promise<void>;
  listForShare(shareId: string): Promise<ShareAccess[]>;
  removeAllForShare(shareId: string): Promise<number>;
}

// Persistent per-space chat — the remote-control page's main feed.
export interface ChatRepo {
  add(input: { spaceId: string; senderId: string; senderKind: "user" | "guest"; senderName: string; text: string; moment: ChatMoment | null }): Promise<ChatMessage>;
  // Most-recent N, returned in ascending (oldest → newest) order so the
  // client can append-only as new messages arrive.
  listForSpace(spaceId: string, limit: number): Promise<ChatMessage[]>;
  // Retention sweep — keep at most `keepLast` messages per space, drop
  // the rest from oldest. Returns the count deleted.
  trim(spaceId: string, keepLast: number): Promise<number>;
  // Every distinct spaceId currently in chat — used by the periodic
  // sweeper to iterate.
  distinctSpaceIds(): Promise<string[]>;
  removeAllForSpace(spaceId: string): Promise<number>;
}

export type Storage = {
  videos: VideoRepo;
  titleLibrary: TitleLibraryRepo;
  recentTitles: RecentTitleRepo;
  users: UserRepo;
  sessions: SessionRepo;
  // Legacy — only the boot migration reads from this. Use storageConnections
  // for everything else.
  storageConfigs: StorageConfigRepo;
  storageConnections: StorageConnectionRepo;
  storageActivations: StorageActivationRepo;
  collections: CollectionRepo;
  spaces: SpaceRepo;
  memberships: MembershipRepo;
  invites: InviteRepo;
  joinRequests: JoinRequestRepo;
  shareLinks: ShareLinkRepo;
  shareAccesses: ShareAccessRepo;
  chat: ChatRepo;
  sessionState: SessionStateRepo;
  watchHistory: WatchHistoryRepo;
  passwordResets: PasswordResetRepo;
  // Lifecycle hook so the server can disconnect cleanly on shutdown.
  close(): Promise<void>;
};

// Per-space watch-history timeline. Opened/closed by the session
// layer; the API surface is read-only paginated.
export interface WatchHistoryRepo {
  add(input: {
    spaceId: string;
    videoUrl: string;
    videoTitle: string | null;
    collectionId: string | null;
    collectionTitle: string | null;
    collectionIndex: number | null;
    duration: number | null;
  }): Promise<WatchHistoryEntry>;
  // Close the row — endedAt = now, lastPosition + completed get fixed
  // values from the caller (e.g. completed=true from videoEnded).
  close(id: string, lastPosition: number, completed: boolean): Promise<void>;
  // Keep the in-flight row's lastPosition in sync as the room ticks.
  updatePosition(id: string, lastPosition: number): Promise<void>;
  // Newest-first, capped at `limit`. Used by the /history page.
  listForSpace(spaceId: string, limit: number): Promise<WatchHistoryEntry[]>;
  removeAllForSpace(spaceId: string): Promise<number>;
}

// Per-space persisted playback snapshot. One row per spaceId. Backs
// the boot-time hydration in sessions.ts so a server restart doesn't
// reset the room.
export interface SessionStateRepo {
  get(spaceId: string): Promise<SessionState | null>;
  put(spaceId: string, state: SessionState): Promise<void>;
  remove(spaceId: string): Promise<void>;
}
