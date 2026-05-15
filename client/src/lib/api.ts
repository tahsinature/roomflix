import type {
  AuthUser,
  GuestIdentity,
  InviteCode,
  InviteKind,
  LibraryHealth,
  Playlist,
  PlaylistDetail,
  ProbeResult,
  Space,
  SessionStateSnapshot,
  SpaceMember,
  SpaceRole,
  SpaceSummary,
  StorageConfig,
  Subtitle,
  Video,
} from "@shared/protocol";

// Thrown by `request` when the server responds 401. The auth provider
// listens for these and clears the cached user — also useful at call sites
// that want to react specifically to an expired session.
export class UnauthorizedError extends Error {
  constructor() {
    super("unauthorized");
    this.name = "UnauthorizedError";
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
    throw new Error(message);
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
  updateProfile: (patch: { displayName?: string | null }) =>
    request<AuthUser>("/api/auth/me", {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),

  // Storage backend config (encrypted at rest server-side).
  getStorageConfig: () => request<StorageConfig | null>("/api/storage/config"),
  putStorageConfig: (config: Omit<StorageConfig, "updatedAt">) =>
    request<StorageConfig>("/api/storage/config", {
      method: "PUT",
      body: JSON.stringify(config),
    }),
  deleteStorageConfig: () => request<void>("/api/storage/config", { method: "DELETE" }),

  // Playlists.
  listPlaylists: () => request<Playlist[]>("/api/playlists"),
  getPlaylist: (id: string) => request<PlaylistDetail>(`/api/playlists/${encodeURIComponent(id)}`),
  createPlaylist: (input: { title: string; videoIds?: string[] }) =>
    request<Playlist>("/api/playlists", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updatePlaylist: (id: string, patch: { title?: string; videoIds?: string[] }) =>
    request<Playlist>(`/api/playlists/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  deletePlaylist: (id: string) => request<void>(`/api/playlists/${encodeURIComponent(id)}`, { method: "DELETE" }),

  // Spaces.
  listSpaces: () => request<SpaceSummary[]>("/api/spaces"),
  createSpace: (input: { name: string }) =>
    request<Space>("/api/spaces", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  getSpace: (id: string) =>
    request<{ space: Space; members: SpaceMember[]; invites: InviteCode[]; role: SpaceRole }>(`/api/spaces/${encodeURIComponent(id)}`),
  renameSpace: (id: string, name: string) =>
    request<Space>(`/api/spaces/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({ name }),
    }),
  deleteSpace: (id: string) => request<void>(`/api/spaces/${encodeURIComponent(id)}`, { method: "DELETE" }),
  leaveSpace: (id: string) =>
    request<void>(`/api/spaces/${encodeURIComponent(id)}/leave`, { method: "POST" }),
  removeMember: (spaceId: string, userId: string) =>
    request<void>(`/api/spaces/${encodeURIComponent(spaceId)}/members/${encodeURIComponent(userId)}`, { method: "DELETE" }),
  createInvite: (
    spaceId: string,
    opts: { kind?: InviteKind; usesRemaining?: number | null; expiresInHours?: number | null } = {},
  ) =>
    request<InviteCode>(`/api/spaces/${encodeURIComponent(spaceId)}/invites`, {
      method: "POST",
      body: JSON.stringify(opts),
    }),
  revokeInvite: (spaceId: string, code: string) =>
    request<void>(`/api/spaces/${encodeURIComponent(spaceId)}/invites/${encodeURIComponent(code)}`, { method: "DELETE" }),
  redeemInvite: (code: string) =>
    request<{ space: Space; alreadyMember: boolean }>("/api/invites/redeem", {
      method: "POST",
      body: JSON.stringify({ code }),
    }),
  redeemInviteAsGuest: (input: { code: string; displayName: string }) =>
    request<{ space: Space; displayName: string }>("/api/invites/redeem-guest", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  lookupInvite: (code: string) =>
    request<{ kind: InviteKind; spaceName: string }>("/api/invites/lookup", {
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

  // TV-pairing for ad-hoc guest joins.
  pairingStart: (displayName: string) =>
    request<{ code: string; expiresAt: number }>("/api/pairing/start", {
      method: "POST",
      body: JSON.stringify({ displayName }),
    }),
  pairingStatus: (code: string) =>
    request<
      | { status: "pending"; expiresAt: number }
      | { status: "approved"; displayName: string; spaceName: string }
      | { status: "expired" }
    >(`/api/pairing/status/${encodeURIComponent(code)}`),
  pairingApprove: (code: string) =>
    request<{ displayName: string; spaceName: string }>("/api/pairing/approve", {
      method: "POST",
      body: JSON.stringify({ code }),
    }),
};
