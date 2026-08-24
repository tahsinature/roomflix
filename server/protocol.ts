// Shared types between client and server. The client imports this file
// directly from ../server/protocol.ts via its tsconfig path alias.

export type Subtitle = {
  id: string;
  url: string;
  label: string;
  lang: string;
};

export type Video = {
  id: string;
  spaceId: string;
  // Who added this entry. Useful when the same space has multiple members
  // contributing — the UI surfaces "added by @sam" and edit/delete rights
  // fall back to creator + space owner.
  addedBy: string;
  url: string;
  title: string;
  subtitles: Subtitle[];
  addedAt: number; // server epoch ms
  updatedAt: number;
};

// Personal discovery library. Unlike Video (a playable URL shared with a
// space), these rows belong to one real user and represent intent around a
// TMDB title: something they want to watch or have already watched.
export type DiscoverMediaType = "movie" | "tv";
export type TitleLibraryStatus = "shortlist" | "watched";

export type TitleLibraryItem = {
  id: string;
  userId: string;
  tmdbId: number;
  mediaType: DiscoverMediaType;
  title: string;
  year: string;
  posterPath: string | null;
  backdropPath: string | null;
  overview: string;
  voteAverage: number;
  voteCount: number;
  genres: string[];
  runtime: number | null;
  imdbId: string | null;
  status: TitleLibraryStatus;
  userRating: number | null;
  notes: string;
  addedAt: number;
  watchedAt: number | null;
  updatedAt: number;
};

export type DiscoverSearchResult = {
  tmdbId: number;
  mediaType: DiscoverMediaType;
  title: string;
  year: string;
  releaseDate: string;
  overview: string;
  posterPath: string | null;
  backdropPath: string | null;
  voteAverage: number;
  voteCount: number;
  adult: boolean;
};

export type DiscoverPersonResult = {
  tmdbId: number;
  name: string;
  profilePath: string | null;
  knownForDepartment: string;
  knownFor: DiscoverSearchResult[];
};

export type DiscoverCastMember = {
  tmdbId: number;
  name: string;
  character: string;
  profilePath: string | null;
};

export type DiscoverPersonCredit = {
  tmdbId: number;
  name: string;
};

export type DiscoverGenre = {
  id: number;
  name: string;
};

export type DiscoverTrailer = {
  id: string;
  youtubeKey: string;
  name: string;
  type: string;
  official: boolean;
};

export type DiscoverWatchProvider = {
  providerId: number;
  name: string;
  logoPath: string | null;
};

export type DiscoverRegionProviders = {
  link: string;
  stream: DiscoverWatchProvider[];
  free: DiscoverWatchProvider[];
  ads: DiscoverWatchProvider[];
  rent: DiscoverWatchProvider[];
  buy: DiscoverWatchProvider[];
};

export type DiscoverTitleDetails = DiscoverSearchResult & {
  originalTitle: string;
  tagline: string;
  runtime: number | null;
  genres: string[];
  spokenLanguages: string[];
  originalLanguage: string;
  status: string;
  imdbId: string | null;
  directors: DiscoverPersonCredit[];
  cast: DiscoverCastMember[];
  recommendations: DiscoverSearchResult[];
  numberOfSeasons: number | null;
  numberOfEpisodes: number | null;
  trailers: DiscoverTrailer[];
  watchProviders: Record<string, DiscoverRegionProviders>;
  /** Regional age certification, e.g. { CA: "14A", US: "PG-13" }. */
  certifications: Record<string, string>;
};

export type DiscoverPersonDetails = {
  tmdbId: number;
  name: string;
  profilePath: string | null;
  knownForDepartment: string;
  biography: string;
  actingCredits: DiscoverSearchResult[];
  creativeCredits: DiscoverSearchResult[];
  productionCredits: DiscoverSearchResult[];
};

export type DiscoverSearchResponse = {
  titles: DiscoverSearchResult[];
  people: DiscoverPersonResult[];
  usedFuzzyFallback: boolean;
};

// Wire shape for the current user. The password hash is never serialized.
// displayName is the friendly label other people see — falls back to
// `@username` everywhere when null.
// Home page mini-monitor bezel chrome. Stored on the user so the home
// surface follows them across spaces. Defaults to "cinema" when unset.
export type BezelStyle = "cinema" | "crt" | "minimal";

export type AuthUser = {
  id: string;
  username: string;
  displayName: string | null;
  isAdmin: boolean;
  createdAt: number;
  // IANA timezone like "America/Los_Angeles". Auto-detected from the
  // browser on first login; user can override in Settings. Surfaced
  // via space-member rows so other viewers can see what time it is
  // where this person is.
  timezone?: string | null;
  // Free-form city label, used for weather lookup + display. Optional.
  city?: string | null;
  // Preferred bezel chrome for the home mini-monitor.
  homeBezelStyle?: BezelStyle | null;
};

// A space groups members + their shared library, playlists, imports, and
// storage backend. Every user has at least one — the auto-created "Home"
// space. Membership is tracked separately so a user can be in many spaces
// and roles are easy to evolve.
// Per-space gate for invite redemption.
//   "open"     — anyone with a valid invite link joins instantly.
//   "approval" — invite redemption creates a JoinRequest; the space
//                owner must approve before the joiner is admitted.
// Defaults to "open" for new spaces (and is the implicit value for
// any pre-existing rows that don't carry the field).
export type SpaceJoinPolicy = "open" | "approval";

export type Space = {
  id: string;
  name: string;
  ownerId: string;
  joinPolicy: SpaceJoinPolicy;
  createdAt: number;
  updatedAt: number;
};

// Pending request to join a space when joinPolicy = "approval". The
// requester might be a real user (account-backed) or a would-be guest
// (display name only). Approval converts the request into the
// corresponding membership or guest session; denial just drops it.
export type JoinRequestStatus = "pending" | "approved" | "denied" | "expired" | "cancelled";

export type JoinRequester = { kind: "user"; userId: string; username: string; displayName: string | null } | { kind: "guest"; displayName: string };

export type JoinRequest = {
  id: string;
  spaceId: string;
  code: string;
  requester: JoinRequester;
  status: JoinRequestStatus;
  requestedAt: number;
  // Absolute epoch ms; the queue auto-expires entries that sit too
  // long so they don't pile up.
  expiresAt: number;
  // Set when the admin acts on the request (approve/deny). Read by
  // the waiting room poll to know what to do next.
  approvedSessionToken?: string | null;
};

export type SpaceRole = "owner" | "member";

export type SpaceMember = {
  spaceId: string;
  userId: string;
  username: string; // denormalized for member lists
  displayName: string | null; // denormalized too; null = render as @username
  role: SpaceRole;
  joinedAt: number;
  // Denormalized from AuthUser so member-list panels can render local
  // time / city without a per-row user fetch. Kept in sync by the
  // profile-update path.
  timezone?: string | null;
  city?: string | null;
};

// Invite codes are short, human-shareable, and bound to one space.
// Recipients pick how to join (guest vs sign in vs create account) at
// the /join page; the code itself is type-agnostic.
//   usesRemaining: caps redemption count (null = unlimited)
//   expiresAt: absolute epoch ms past which redemption is rejected (null
//              = never expires)
export type InviteCode = {
  code: string;
  spaceId: string;
  createdBy: string;
  usesRemaining: number | null;
  expiresAt: number | null;
  createdAt: number;
};

// Guest identity returned by /api/auth/session for guest cookies. The id
// is the opaque session token — used as a stable per-session attribution
// handle for addedBy / createdBy fields on writes.
export type GuestIdentity = {
  id: string;
  displayName: string;
  spaceId: string;
};

// Connected viewer identity, surfaced in WS broadcasts and the /state
// snapshot so the UI can render "who's watching" instead of just a count.
// `id` is deduped per-identity (real user id for users, guest session
// token for guests) — multiple tabs from the same person count once.
//
// A Viewer is specifically someone with status "watching" (they're on
// /watch). For the broader "who's in this space at all" use Participant.
export type Viewer = {
  id: string;
  kind: "user" | "guest";
  displayName: string;
};

// Per-identity presence in a space. Same dedupe rules as Viewer; the
// `status` field is the highest-engaged status across all of that
// identity's tabs (one watching tab + one dashboard tab → "watching").
//   offline  — not in this list at all; the client derives it by
//              checking membership against the presence list
//   online   — connected somewhere in the app, but not on /watch
//   watching — actively on /watch
export type PresenceStatus = "online" | "watching";

// Per-tab audio settings. Always per-device — we never apply someone
// else's volume to your own player. Surfaced so other viewers can tell
// "alice is muted, that's why she's not laughing", not for control.
export type Volume = {
  // 0..1 inclusive. Matches HTMLMediaElement.volume.
  level: number;
  muted: boolean;
};

export type Participant = {
  id: string;
  kind: "user" | "guest";
  displayName: string;
  status: PresenceStatus;
  // Only set for status === "watching" — others aren't running a player.
  // Most-recent-updated tab wins when one identity has multiple watching
  // tabs (matches user intent on the device they last touched).
  volume?: Volume;
  // Number of live sockets carrying this identity, broken down by
  // status. Used by the user-detail modal to show "2 tabs (1 watching,
  // 1 elsewhere)". `total` is `watching + online`.
  tabs: {
    total: number;
    watching: number;
    online: number;
  };
  // For guests: when their session was created (≈ when they paired).
  // Members' joined-at lives in space_members.joinedAt; the client
  // already has that via the cached members list.
  guestJoinedAt?: number;
};

// Lightweight snapshot of the in-memory playback session for a space.
// Returned by GET /api/session/state and used to render the "currently
// playing" banner without opening a full WS connection (which would count
// as a viewer and pollute the count).
export type SessionStateSnapshot = {
  videoUrl: string | null;
  videoTitle: string | null;
  playing: boolean;
  viewers: Viewer[];
  // Set when a collection (an ordered mixed-media list) is loaded.
  collectionId: string | null;
};

// Lightweight "what space am I in right now" hint shipped with /api/auth/session.
export type SpaceSummary = {
  id: string;
  name: string;
  role: SpaceRole;
};

// DEPRECATED — kept for the boot migration that reads legacy rows and
// converts them to the new account-level storage_connections shape.
// All new code should use StorageConnection.
export type StorageConfig = {
  provider: "r2";
  accountId: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl?: string;
  maxBytes: number;
  label?: string;
  updatedAt: number;
};

// New storage model. Three orthogonal concepts:
//
//   1. StorageConnection — an account-level credential record owned by
//      one user (the "admin"). Holds the actual R2/S3 creds.
//   2. StorageActivation — marks a connection as exposed in one of the
//      owner's spaces. Without an activation the connection exists but
//      isn't reachable from any space.
//   3. StorageGrant — marks a user as authorized to use a connection.
//      Grants are global across all spaces where the connection is
//      activated — owner trusts the user with the cred, full stop.
//
// In a space S, a member sees a connection iff
//   (S.ownerId === connection.ownerId) ∧ (activation exists for [conn, S])
//   ∧ (caller === connection.ownerId ∨ grant exists for [conn, caller])
export type StorageProvider = "r2" | "s3";

// Wire shape. secretAccessKey is intentionally absent — clients fetch
// the cleartext separately via the ECDH endpoint when (and only when)
// they're about to do a management op. Browsing the connection list
// never reveals secrets.
type StorageConnectionBase = {
  id: string;
  ownerId: string;
  label: string;
  bucket: string;
  accessKeyId: string;
  publicBaseUrl?: string;
  maxBytes: number;
  createdAt: number;
  updatedAt: number;
  // Denormalized owner identity, populated by per-space listings so
  // the UI can render "by @alice" without an N+1 user lookup. Absent
  // on account-level listings where the owner is implicitly the
  // caller.
  ownerUsername?: string;
  ownerDisplayName?: string | null;
};

export type StorageConnection = StorageConnectionBase & ({ provider: "r2"; accountId: string; region?: never } | { provider: "s3"; region: string; accountId?: never });

// One row per (connection, space). Always implies space.ownerId ===
// connection.ownerId (enforced at insert time).
//
// `openToGuests` lets guest sessions in the space use this connection
// without needing an explicit per-user grant. Grants don't work for
// guests anyway (their identity is a transient session token), so this
// is the canonical way to give guests storage access.
export type StorageActivation = {
  connectionId: string;
  spaceId: string;
  activatedAt: number;
  openToGuests: boolean;
};

// Detail bundle for the account-level storage page. One trip returns
// every connection with its activations resolved. Access control is
// role-based via the activation's "+ Guests" flag — no per-user
// grants. (We tried that once; the matrix complexity outweighed the
// flexibility for this app's small-group scale.)
export type StorageConnectionDetail = {
  connection: StorageConnection;
  activations: StorageActivation[];
};

// Minimal JWK shape for ECDH P-256 public keys. The full DOM type is
// huge and we don't have the DOM lib in the server tsconfig — for our
// use the kty/crv/x/y quartet is all we need to import the key.
export type EcdhPublicJwk = {
  kty: "EC";
  crv: "P-256";
  x: string;
  y: string;
  ext?: boolean;
  key_ops?: string[];
};

// ECDH wire shapes for the secret exchange. Client generates an
// ephemeral P-256 keypair, sends the public half; server derives the
// shared AES key, encrypts the secret, returns iv + ciphertext + its
// own ephemeral public half. Network observers see only opaque blobs.
export type SecretExchangeRequest = {
  clientPub: EcdhPublicJwk;
};

export type SecretExchangeResponse = {
  iv: string; // base64
  ciphertext: string; // base64
  serverPub: EcdhPublicJwk;
};

// "ok"          → URL responded 2xx/3xx within timeout
// "gone"        → URL responded 4xx/5xx, timed out, or network error
// "unverified"  → host disallows HEAD (e.g. 405) — couldn't determine
export type HealthStatus = "ok" | "gone" | "unverified";

// Per-video health snapshot. The map is keyed by Subtitle.id.
export type VideoHealth = {
  video: HealthStatus;
  subtitles: Record<string, HealthStatus>;
};

export type LibraryHealth = {
  checkedAt: number;
  videos: Record<string, VideoHealth>;
};

// Verdict for a one-shot URL probe used by the library Add form.
//   "ok"        — reachable AND looks like a video (content-type starts with
//                  "video/" or URL has a known video extension).
//   "uncertain" — reachable but content-type is unclear, or HEAD blocked but
//                  URL has a video extension. User can override.
//   "gone"      — 4xx/5xx/network error/timeout.
export type ProbeVerdict = "ok" | "uncertain" | "gone";

export type ProbeResult = {
  verdict: ProbeVerdict;
  contentType?: string;
  contentLength?: number;
  message?: string;
};

// Synced session state — shared across everyone in the same space.
// Audio settings (volume, muted) are intentionally NOT here — they're
// per-device, like every other watch-together product. One viewer muting
// their phone shouldn't mute everyone else.
export type SessionState = {
  videoUrl: string | null;
  // Resolved library title for videoUrl. Server fills this on setUrl from
  // the library entry. Null when there's no URL loaded.
  videoTitle: string | null;
  // Snapshot of the library entry's subtitles at the time of the last setUrl.
  // Empty if the URL has no library entry. Selection (which one to show) is
  // per-viewer, not in here.
  subtitles: Subtitle[];
  playing: boolean;
  // currentTime is the playback position at `updatedAt`.
  // If playing, effective time is currentTime + (now - updatedAt) / 1000.
  currentTime: number;
  // Collection context. Null `collectionId` means the room is on a
  // standalone URL (the videoUrl above) — collectionIndex is meaningless
  // then but kept at 0 for serialization simplicity. A collection is an
  // ordered mixed-media list; videoUrl carries the current item's URL.
  collectionId: string | null;
  collectionIndex: number;
  collectionLoop: boolean;
  // Shuffle the next-item pick on videoEnded auto-advance. Implies
  // an endless queue — shuffle ON keeps the room going regardless of
  // collectionLoop, since there's no "end" with a randomized order.
  collectionShuffle: boolean;
  // Total length of the currently-loaded media in seconds. Null for
  // photos (no timeline) and while the active player hasn't reported
  // its metadata yet. Pushed by the watching client on loadedmetadata
  // — the server itself never inspects media. Lets the remote draw a
  // progress bar without having to load the media just to read its
  // duration.
  duration: number | null;
  updatedAt: number; // server epoch ms
  updatedBy: string | null; // clientId
};

// One item in a Collection — a single piece of media. `url` is a direct
// public URL; `name` is a human-readable label, usually the original
// filename. The media kind (video / audio / image) is derived from the
// URL extension at render time, so one collection can interleave all three.
export type CollectionItem = {
  url: string;
  name: string;
};

// A Collection — an ordered, mixed-media list owned by a space. Replaces
// the older split between playlists (video) and albums (photo): a single
// collection can interleave videos, audio, and photos. Items are stored
// inline (not Library refs), so a folder of hundreds of files is one
// document. Built from storage folders and editable (reorder / add /
// remove). Edit & delete are allowed for the creator and the space owner.
// `source`, when set, makes the collection a LIVE projection of a
// storage folder. Items are computed server-side on read (fresh from the
// bucket, cached briefly) and the collection is read-only; the title
// also tracks the folder name. A null source means a manual collection
// — items are stored inline and the user can edit / reorder them.
export type CollectionSource = { connectionId: string; folderPrefix: string };

// Per-collection media-kind filter. Synced collections only — the
// resolver drops items whose URL extension doesn't match one of the
// listed kinds. Null (or an empty `kinds` array) means "all kinds"
// — behavior identical to a collection without a filter, which keeps
// pre-feature collections working without backfill.
export type CollectionMediaFilter = {
  kinds: ("video" | "audio" | "image")[];
};

export type Collection = {
  id: string;
  spaceId: string;
  createdBy: string;
  title: string;
  items: CollectionItem[];
  source: CollectionSource | null;
  // Optional cover image URL — overrides the auto-picked thumbnail.
  // Editable on both manual and synced collections (the field lives on
  // the collection doc, not the items). Null means "auto" (renderer
  // falls back to the first image item, then a placeholder).
  coverUrl: string | null;
  // Optional media-kind filter — synced collections only. Server-side
  // resolver drops non-matching items so the items array delivered to
  // clients IS the canonical play list (sync stays consistent across
  // viewers; no per-client divergence).
  mediaFilter: CollectionMediaFilter | null;
  createdAt: number;
  updatedAt: number;
};

// Per-URL availability snapshot for a collection's items — keyed by item
// URL, since collection items have no IDs. Same HEAD-probe basis as
// LibraryHealth; surfaced in the theater filmstrip + player.
export type CollectionHealth = {
  checkedAt: number;
  items: Record<string, HealthStatus>;
};

// ── Public share links ──────────────────────────────────────────────
// A shareable, optionally passcode-gated link to a single media URL or a
// whole collection — reachable WITHOUT a session at /share/:code. The
// passcode hash never crosses the wire; `hasPasscode` stands in for it.
export type ShareTargetKind = "url" | "collection";

export type ShareLink = {
  id: string; // also the public code in /share/:code
  spaceId: string;
  createdBy: string;
  label: string;
  targetKind: ShareTargetKind;
  targetUrl: string | null;
  targetTitle: string | null;
  targetCollectionId: string | null;
  hasPasscode: boolean;
  expiresAt: number | null;
  maxAccesses: number | null;
  accessCount: number;
  disabled: boolean;
  createdAt: number;
  lastAccessedAt: number | null;
};

// One recorded open of a share link — the rows behind the access log.
export type ShareAccess = {
  id: string;
  ip: string;
  userAgent: string;
  accessedAt: number;
};

// The public payload served once a share resolves (and unlocks). Carries
// no owner / space / passcode data. `items` holds one entry for a url
// share, N for a collection.
export type PublicShareItem = { url: string; name: string };

export type PublicShare = {
  label: string;
  kind: ShareTargetKind;
  title: string;
  items: PublicShareItem[];
};

// Response of GET /api/share/:code and POST .../unlock — a small state
// machine the public page renders directly. A missing code is a 404.
export type PublicShareGate = { state: "ready"; share: PublicShare } | { state: "passcode"; label: string } | { state: "unavailable"; reason: "disabled" | "expired" | "limit" };

// Lightweight, ephemeral reaction broadcast over the session WS. Doesn't
// touch playback state and isn't persisted — a moment-in-time event sent
// to everyone currently watching together. Text reactions used to ride
// this channel too; they now travel as `chat` messages (persistent) and
// only emoji come through here.
export type ReactionContent = { kind: "emoji"; emoji: string } | { kind: "text"; text: string };

// A captured point in playback that can ride along on a chat message —
// "this scene", "this beat", "this photo". Receivers tap the chip in
// the thread / bubble and the server loads that item + seeks to
// `currentTime`. For a photo `currentTime` is just 0. `mediaTitle` is
// denormalized so the chip stays readable even if the source title
// later changes.
export type ChatMoment = {
  videoUrl: string;
  currentTime: number;
  mediaTitle: string;
  collectionId: string | null;
  collectionIndex: number | null;
};

// One row in the per-space watch history timeline. Opened when the
// room's loaded URL changes, closed when the next URL change (or end
// of media) occurs. Snapshots title/duration so the timeline stays
// readable even if the source is later removed.
export type WatchHistoryEntry = {
  id: string;
  spaceId: string;
  videoUrl: string;
  videoTitle: string | null;
  collectionId: string | null;
  collectionTitle: string | null;
  collectionIndex: number | null;
  duration: number | null;
  startedAt: number;
  // Null while the entry is still the room's active item.
  endedAt: number | null;
  // Most recently reported playback position (seconds). Updated by the
  // 2s persist heartbeat while playing.
  lastPosition: number;
  // True only when the player reported videoEnded — distinguishes
  // "watched to the end" from "swapped to the next item".
  completed: boolean;
};

// Persistent chat message — the remote-control page's main feed. Lives
// in the DB so a phone that opens later can scroll back. Also broadcast
// live on the WS and rendered as an ephemeral bubble on /watch so the
// theater audience sees what's being said without leaving the picture.
export type ChatMessage = {
  id: string;
  spaceId: string;
  senderId: string;
  senderKind: "user" | "guest";
  senderName: string;
  text: string;
  // Optional "scene" pointer. When set, clients render a clickable chip
  // that asks the server to jump the room to that point.
  moment: ChatMoment | null;
  sentAt: number;
};

// Messages sent by the client to the server.
//
// Collection messages:
//   loadCollection     — switch the room onto a collection; server seeds
//                        videoUrl from index 0 (null for empty ones).
//   collectionNext /
//     collectionPrev   — manual nav. Server clamps at the ends unless
//                        loop=on, in which case it wraps.
//   collectionJumpTo   — set a specific index (e.g. clicking a strip item).
//   setCollectionLoop  — toggle wrap-at-end behavior.
//   videoEnded         — fired by the client when a video/audio item
//                        finishes. The `endedUrl` field lets the server
//                        ignore stale signals (e.g. a rejoined client).
export type ClientMessage =
  | { type: "hello"; clientId: string }
  // currentTime is optional on play/pause — the remote-control surface
  // doesn't have a live player to read it from, so the server falls
  // back to the room's expected time when absent.
  | { type: "play"; currentTime?: number }
  | { type: "pause"; currentTime?: number }
  | { type: "seek"; currentTime: number }
  | { type: "setUrl"; videoUrl: string }
  | { type: "loadCollection"; collectionId: string }
  | { type: "collectionNext" }
  | { type: "collectionPrev" }
  | { type: "collectionJumpTo"; index: number }
  | { type: "setCollectionLoop"; loop: boolean }
  | { type: "setCollectionShuffle"; shuffle: boolean }
  | { type: "videoEnded"; endedUrl: string }
  // Quick emoji or short text reaction. Server validates the payload
  // (allowed emoji set, length cap), rate-limits per sender, then fans
  // it out to everyone watching. Never affects playback.
  | { type: "reaction"; reaction: ReactionContent }
  // Persistent chat message — server stores it, broadcasts to everyone
  // in the space, then a periodic sweeper trims each space to its
  // retention cap. Shares the reaction rate-limit window. Optionally
  // carries a `moment` so the message points at a specific scene the
  // receivers can jump to.
  | { type: "chat"; text: string; moment?: ChatMoment }
  // Receiver clicked a scene chip — server loads the referenced item
  // (and collection context if any) and seeks to the captured time.
  | { type: "jumpTo"; moment: ChatMoment }
  // Sent when the client transitions in/out of /watch within the SPA.
  // Server updates ws.data.status and rebroadcasts presence + viewers.
  | { type: "setStatus"; status: PresenceStatus }
  // Sent from the Watch page when the player's volume or muted state
  // changes. Server updates ws.data.volume + rebroadcasts presence so
  // other clients can show "alice is muted" etc. Client should debounce
  // to avoid flooding during slider drags.
  | { type: "setVolume"; level: number; muted: boolean }
  // Reports the playing media's total length once the active player
  // has decoded its metadata. Stored on session state so the remote
  // can draw a progress bar without loading the media. The server
  // clears this whenever the URL changes (it'll come back on the next
  // loadedmetadata from the watcher).
  | { type: "setDuration"; duration: number | null };

// Messages sent by the server to clients.
export type ServerMessage =
  | { type: "state"; state: SessionState; viewers: Viewer[]; serverTime: number }
  | { type: "viewers"; viewers: Viewer[] }
  // Full presence list — everyone connected to this space, with status.
  // Sent on join, leave, and status change. Clients should treat this
  // as the source of truth and replace their local participant list.
  | { type: "presence"; participants: Participant[] }
  // Persistent membership delta. Sent when a member's denormalized
  // fields change (e.g. they edited their display name). Clients patch
  // their REST-cached members list by userId — the row's other fields
  // remain valid since it's the same membership record.
  | { type: "memberUpdated"; member: SpaceMember }
  // Soft notification to admins watching a space whose joinPolicy is
  // "approval": a new request just landed in the queue. Clients refetch
  // the pending list on receipt — body is just a nudge, not the full
  // row, so we don't have to worry about ACL.
  | { type: "joinRequestPending"; spaceId: string }
  // Broadcast to every "watching" socket in a space. Carries the sender
  // identity so the receiver can show "alice 🔥" floating up. clientId
  // lets the sender's own client recognize echoes if it cares.
  | { type: "reaction"; reaction: ReactionContent; sender: { id: string; name: string }; clientId: string; sentAt: number }
  // Broadcast to ALL sockets in a space (including remote controls).
  // Carries the full persisted row so clients can append directly.
  | { type: "chat"; message: ChatMessage }
  // Owner-initiated wipe of the space's chat history. Triggers every
  // connected client to reset its local thread state.
  | { type: "chatCleared" };

export function emptySessionState(): SessionState {
  return {
    videoUrl: null,
    videoTitle: null,
    subtitles: [],
    playing: false,
    currentTime: 0,
    collectionId: null,
    collectionIndex: 0,
    collectionLoop: false,
    collectionShuffle: false,
    duration: null,
    updatedAt: Date.now(),
    updatedBy: null,
  };
}
