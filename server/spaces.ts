import type { Space, SpaceSummary } from "@/protocol.ts";
import type { Storage, StoredUser } from "@/storage/types.ts";
import { endSessionForSpace } from "@/sessions.ts";

// Idempotently ensure the given user has a Home space they own. Returns
// the resulting space — either the freshly-created one or the existing
// one (matched by name + owner). Used at registration time and by the
// boot migration for users that predated Phase 4.
export async function ensureHomeSpace(storage: Storage, user: Pick<StoredUser, "id" | "username"> & { displayName?: string | null }): Promise<Space> {
  const memberships = await storage.memberships.listForUser(user.id);
  for (const m of memberships) {
    if (m.role !== "owner") continue;
    const space = await storage.spaces.get(m.spaceId);
    if (space) return space;
  }

  const space = await storage.spaces.create({
    name: `Home of @${user.username}`,
    ownerId: user.id,
  });
  await storage.memberships.add({
    spaceId: space.id,
    userId: user.id,
    username: user.username,
    displayName: user.displayName ?? null,
    role: "owner",
  });
  return space;
}

// Render the spaces a user belongs to as the lightweight summary shape we
// embed in /api/auth/session. Skips spaces whose backing record was
// deleted (membership row hanging around without a space).
export async function listSpaceSummaries(storage: Storage, userId: string): Promise<SpaceSummary[]> {
  const memberships = await storage.memberships.listForUser(userId);
  const out: SpaceSummary[] = [];
  for (const m of memberships) {
    const space = await storage.spaces.get(m.spaceId);
    if (!space) continue;
    out.push({ id: space.id, name: space.name, role: m.role });
  }
  return out;
}

// Pick a sensible "current space" to land a user on after login. Prefers
// a space they own (their Home), falls back to any membership, returns
// null when the user truly has no spaces (rare — only after they've
// explicitly left every one). Caller stamps the result onto the session.
export async function resolveDefaultSpaceId(storage: Storage, userId: string): Promise<string | null> {
  const memberships = await storage.memberships.listForUser(userId);
  if (memberships.length === 0) return null;
  const owned = memberships.find((m) => m.role === "owner");
  return (owned ?? memberships[0]!).spaceId;
}

// Cascade-delete a space: every owned record (videos, playlists, imports,
// storage config, members, invites) goes too. Caller must verify the
// requester is the space owner before invoking.
export async function deleteSpaceCascade(storage: Storage, spaceId: string): Promise<void> {
  // Order: child records first so we don't leave dangling refs if any
  // partial failure occurs mid-cascade. The Home space concept is
  // structural — removing the underlying space is fine; users will land
  // on whatever else they're a member of next time they log in.
  const videos = await storage.videos.list(spaceId);
  await Promise.all(videos.map((v) => storage.videos.remove(spaceId, v.id)));
  const collections = await storage.collections.list(spaceId);
  await Promise.all(collections.map((col) => storage.collections.remove(spaceId, col.id)));
  await storage.storageConfigs.remove(spaceId).catch(() => undefined);
  // Share links + their access logs.
  const shareLinks = await storage.shareLinks.listForSpace(spaceId);
  await Promise.all(shareLinks.map((s) => storage.shareAccesses.removeAllForShare(s.id)));
  await storage.shareLinks.removeAllForSpace(spaceId);
  await storage.invites.removeAllForSpace(spaceId);
  await storage.joinRequests.removeAllForSpace(spaceId);
  await storage.memberships.removeAllForSpace(spaceId);
  await storage.spaces.remove(spaceId);
  // Kick anyone currently connected to the in-memory session so they
  // don't keep firing messages into a phantom space.
  endSessionForSpace(spaceId);
}
