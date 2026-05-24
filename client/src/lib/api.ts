import type {
  AuthUser,
  ChatMessage,
  Collection,
  CollectionHealth,
  CollectionItem,
  GuestIdentity,
  InviteCode,
  JoinRequest,
  LibraryHealth,
  ProbeResult,
  PublicShareGate,
  ShareAccess,
  ShareLink,
  Space,
  SpaceJoinPolicy,
  SessionStateSnapshot,
  SpaceMember,
  SpaceRole,
  SpaceSummary,
  StorageActivation,
  StorageConnection,
  StorageConnectionDetail,
  Subtitle,
  Video,
  WatchHistoryEntry,
} from "@shared/protocol";

// Result of POST /api/invites/redeem. When the target space's
// joinPolicy is "approval", the redeem creates a pending JoinRequest
// instead of joining immediately — the caller (the /join page) routes
// to the waiting room.
export type RedeemInviteResult = { pending: true; requestId: string; spaceName: string } | { space: Space; alreadyMember: boolean; pending?: undefined };

// Same shape, guest path.
export type RedeemInviteGuestResult = { pending: true; requestId: string; spaceName: string } | { space: Space; displayName: string; pending?: undefined };

// Thrown by `request` when the server responds 401. The auth provider
// listens for these and clears the cached user — also useful at call sites
// that want to react specifically to an expired session.
export class UnauthorizedError extends Error {
  constructor() {
    super("unauthorized");
    this.name = "UnauthorizedError";
  }
}

// Thrown for all other non-2xx responses. Carries the HTTP status so
// callers can branch on 403 / 404 / etc. without string-matching the
// message. `message` is the server's JSON `error` field when present.
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    // Always send the session cookie. Same-origin in prod; Vite dev server
    // proxies /api to the Bun server so credentials still flow through.
    credentials: "same-origin",
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (res.status === 401) throw new UnauthorizedError();
  if (!res.ok) {
    // Server consistently returns { error: "..." } for failures. Pull
    // that out so callers (and modal banners) get a clean human-readable
    // message instead of "404 Not Found: { ... }". Falls back to the
    // status line when the body isn't JSON or doesn't carry `error`.
    const text = await res.text().catch(() => "");
    let message = text || `${res.status} ${res.statusText}`;
    if (text) {
      try {
        const body = JSON.parse(text) as { error?: unknown };
        if (typeof body?.error === "string" && body.error.trim()) {
          message = body.error;
        }
      } catch {
        // not JSON; keep the raw text
      }
    }
    throw new ApiError(message, res.status);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  listVideos: () => request<Video[]>("/api/videos"),
  createVideo: (input: { url: string; title?: string; subtitles?: Subtitle[] }) =>
    request<Video>("/api/videos", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateVideo: (id: string, patch: { url?: string; title?: string; subtitles?: Subtitle[] }) =>
    request<Video>(`/api/videos/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  deleteVideo: (id: string) =>
    request<void>(`/api/videos/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
  libraryHealth: (opts: { refresh?: boolean } = {}) => request<LibraryHealth>(opts.refresh ? "/api/library/health?refresh=true" : "/api/library/health"),
  probeUrl: (url: string) =>
    request<ProbeResult>("/api/library/probe", {
      method: "POST",
      body: JSON.stringify({ url }),
    }),
  // Auth.
  authSession: () =>
    request<{
      user: AuthUser | null;
      guest: GuestIdentity | null;
      registrationAllowed: boolean;
      currentSpaceId: string | null;
      spaces: SpaceSummary[];
    }>("/api/auth/session"),
  authLogin: (input: { username: string; password: string }) =>
    request<AuthUser>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  authRegister: (input: { username: string; password: string }) =>
    request<AuthUser>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  authLogout: () => request<void>("/api/auth/logout", { method: "POST" }),
  updateProfile: (patch: { displayName?: string | null; timezone?: string | null; city?: string | null; homeBezelStyle?: "cinema" | "crt" | "minimal" | null }) =>
    request<AuthUser>("/api/auth/me", {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),

  // Account-level storage connections. The "Settings" UI manages these.
  // Secrets are NEVER returned by these calls — fetch via fetchSecret.
  listStorageConnections: () => request<StorageConnectionDetail[]>("/api/account/storage"),
  createStorageConnection: (input: {
    label: string;
    provider: "r2";
    accountId: string;
    bucket: string;
    accessKeyId: string;
    secretAccessKey: string;
    publicBaseUrl?: string;
    maxBytes: number;
  }) =>
    request<StorageConnectionDetail>("/api/account/storage", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateStorageConnection: (
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
  ) =>
    request<StorageConnectionDetail>(`/api/account/storage/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  deleteStorageConnection: (id: string) => request<void>(`/api/account/storage/${encodeURIComponent(id)}`, { method: "DELETE" }),

  activateStorageConnection: (id: string, spaceId: string, opts: { openToGuests?: boolean } = {}) =>
    request<StorageActivation>(`/api/account/storage/${encodeURIComponent(id)}/activations`, {
      method: "POST",
      body: JSON.stringify({ spaceId, ...opts }),
    }),
  deactivateStorageConnection: (id: string, spaceId: string) =>
    request<void>(`/api/account/storage/${encodeURIComponent(id)}/activations/${encodeURIComponent(spaceId)}`, {
      method: "DELETE",
    }),

  // Per-space derived view — list of connections active in this space
  // that the caller can use. No secrets in the payload.
  listSpaceStorage: (spaceId: string) => request<StorageConnection[]>(`/api/spaces/${encodeURIComponent(spaceId)}/storage`),

  // Collections — ordered mixed-media lists. Items are stored inline, so
  // getCollection returns everything the player + editor need in one trip.
  listCollections: () => request<Collection[]>("/api/collections"),
  getCollection: (id: string) => request<Collection>(`/api/collections/${encodeURIComponent(id)}`),
  getCollectionHealth: (id: string, opts: { refresh?: boolean } = {}) =>
    request<CollectionHealth>(`/api/collections/${encodeURIComponent(id)}/health${opts.refresh ? "?refresh=true" : ""}`),
  createCollection: (input: { title: string; items?: CollectionItem[]; source?: { connectionId: string; folderPrefix: string } }) =>
    request<Collection>("/api/collections", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateCollection: (id: string, patch: { title?: string; items?: CollectionItem[] }) =>
    request<Collection>(`/api/collections/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  deleteCollection: (id: string) => request<void>(`/api/collections/${encodeURIComponent(id)}`, { method: "DELETE" }),

  // Share links — public, optionally passcode-gated links to a media URL
  // or a collection. CRUD here is authed; redemption is the public route.
  listShares: () => request<ShareLink[]>("/api/shares"),
  createShare: (input: {
    label?: string;
    targetKind: "url" | "collection";
    targetUrl?: string;
    targetTitle?: string;
    targetCollectionId?: string;
    passcode?: string;
    expiresAt?: number | null;
    maxAccesses?: number | null;
  }) => request<ShareLink>("/api/shares", { method: "POST", body: JSON.stringify(input) }),
  updateShare: (id: string, patch: { label?: string; disabled?: boolean; expiresAt?: number | null; maxAccesses?: number | null; passcode?: string | null }) =>
    request<ShareLink>(`/api/shares/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteShare: (id: string) => request<void>(`/api/shares/${encodeURIComponent(id)}`, { method: "DELETE" }),
  shareAccesses: (id: string) => request<ShareAccess[]>(`/api/shares/${encodeURIComponent(id)}/accesses`),
  // Public share redemption — no session required.
  getPublicShare: (code: string) => request<PublicShareGate>(`/api/share/${encodeURIComponent(code)}`),
  unlockPublicShare: (code: string, passcode: string) =>
    request<PublicShareGate>(`/api/share/${encodeURIComponent(code)}/unlock`, {
      method: "POST",
      body: JSON.stringify({ passcode }),
    }),

  // Spaces.
  listSpaces: () => request<SpaceSummary[]>("/api/spaces"),
  createSpace: (input: { name: string }) =>
    request<Space>("/api/spaces", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  getSpace: (id: string) => request<{ space: Space; members: SpaceMember[]; invites: InviteCode[]; role: SpaceRole }>(`/api/spaces/${encodeURIComponent(id)}`),
  renameSpace: (id: string, name: string) =>
    request<Space>(`/api/spaces/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({ name }),
    }),
  setSpaceJoinPolicy: (id: string, joinPolicy: SpaceJoinPolicy) =>
    request<Space>(`/api/spaces/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({ joinPolicy }),
    }),
  deleteSpace: (id: string) => request<void>(`/api/spaces/${encodeURIComponent(id)}`, { method: "DELETE" }),
  leaveSpace: (id: string) => request<void>(`/api/spaces/${encodeURIComponent(id)}/leave`, { method: "POST" }),
  removeMember: (spaceId: string, userId: string) => request<void>(`/api/spaces/${encodeURIComponent(spaceId)}/members/${encodeURIComponent(userId)}`, { method: "DELETE" }),
  createInvite: (spaceId: string, opts: { usesRemaining?: number | null; expiresInHours?: number | null } = {}) =>
    request<InviteCode>(`/api/spaces/${encodeURIComponent(spaceId)}/invites`, {
      method: "POST",
      body: JSON.stringify(opts),
    }),
  revokeInvite: (spaceId: string, code: string) => request<void>(`/api/spaces/${encodeURIComponent(spaceId)}/invites/${encodeURIComponent(code)}`, { method: "DELETE" }),
  redeemInvite: (code: string) =>
    request<RedeemInviteResult>("/api/invites/redeem", {
      method: "POST",
      body: JSON.stringify({ code }),
    }),
  redeemInviteAsGuest: (input: { code: string; displayName: string }) =>
    request<RedeemInviteGuestResult>("/api/invites/redeem-guest", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  // Admin-side queue management (joinPolicy: approval). The owner is
  // the only principal allowed to call these per server-side checks.
  listJoinRequests: (spaceId: string) => request<JoinRequest[]>(`/api/spaces/${encodeURIComponent(spaceId)}/join-requests`),
  approveJoinRequest: (spaceId: string, requestId: string) =>
    request<JoinRequest>(`/api/spaces/${encodeURIComponent(spaceId)}/join-requests/${encodeURIComponent(requestId)}/approve`, { method: "POST" }),
  denyJoinRequest: (spaceId: string, requestId: string) =>
    request<JoinRequest>(`/api/spaces/${encodeURIComponent(spaceId)}/join-requests/${encodeURIComponent(requestId)}/deny`, { method: "POST" }),
  // Joiner-side. The request id is itself the bearer credential — if
  // you have it, you're the one who submitted it.
  getJoinRequest: (id: string) => request<JoinRequest>(`/api/join-requests/${encodeURIComponent(id)}`),
  cancelJoinRequest: (id: string) => request<JoinRequest>(`/api/join-requests/${encodeURIComponent(id)}/cancel`, { method: "POST" }),
  lookupInvite: (code: string) =>
    request<{ spaceName: string }>("/api/invites/lookup", {
      method: "POST",
      body: JSON.stringify({ code }),
    }),
  switchSpace: (spaceId: string) =>
    request<void>("/api/session/space", {
      method: "PUT",
      body: JSON.stringify({ spaceId }),
    }),
  sessionState: () => request<SessionStateSnapshot | null>("/api/session/state"),
  sessionMembers: () => request<SpaceMember[]>("/api/session/members"),
  // Persistent chat history for the current space — used by the remote
  // control page to backfill what was said before it opened.
  chatHistory: (spaceId: string, limit = 100) => request<ChatMessage[]>(`/api/spaces/${encodeURIComponent(spaceId)}/chat?limit=${limit}`),
  clearChat: (spaceId: string) =>
    request<{ deleted: number }>(`/api/spaces/${encodeURIComponent(spaceId)}/chat`, { method: "DELETE" }),
  watchHistory: (spaceId: string, limit = 100) =>
    request<WatchHistoryEntry[]>(`/api/spaces/${encodeURIComponent(spaceId)}/history?limit=${limit}`),
  clearWatchHistory: (spaceId: string) =>
    request<{ deleted: number }>(`/api/spaces/${encodeURIComponent(spaceId)}/history`, { method: "DELETE" }),
};
