import { Hono } from "hono";

import type { StorageConnection, StorageConnectionDetail } from "@/protocol.ts";
import type { Storage } from "@/storage/index.ts";
import { requireUser } from "@/auth.ts";

// Account-level storage management. All routes scoped to the caller's
// account — only the connection owner can list/create/edit/delete their
// own connections and manage activations on their spaces. Access for
// non-owners is purely role-based via the activation's openToGuests
// flag (members get any activation; guests need "+ Guests").
//
// The cleartext secret is never returned by any of these routes. To
// fetch it, the caller hits POST /api/storage/secret/:cid (separate
// router so guests can use it too).
//
//   GET    /api/account/storage                            list with details
//   POST   /api/account/storage                            create connection
//   GET    /api/account/storage/:cid                       single detail
//   PATCH  /api/account/storage/:cid                       update
//   DELETE /api/account/storage/:cid                       delete (cascade)
//   POST   /api/account/storage/:cid/activations           { spaceId, openToGuests? } → upsert
//   DELETE /api/account/storage/:cid/activations/:spaceId  deactivate
export function buildAccountStorageRouter(storage: Storage) {
  const app = new Hono();
  app.use("*", requireUser(storage));

  app.get("/", async (c) => {
    const user = c.get("user");
    const connections = await storage.storageConnections.listForOwner(user.id);
    const detail: StorageConnectionDetail[] = await Promise.all(
      connections.map(async (conn) => ({
        connection: conn,
        activations: await storage.storageActivations.listForConnection(conn.id),
      })),
    );
    return c.json(detail);
  });

  app.post("/", async (c) => {
    const user = c.get("user");
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    const validated = validateCreate(body);
    if (!validated.ok) return c.json({ error: validated.error }, 400);
    const created = await storage.storageConnections.create({
      ownerId: user.id,
      ...validated.value,
    });
    return c.json(detailFor(created, []), 201);
  });

  app.get("/:cid", async (c) => {
    const user = c.get("user");
    const conn = await loadOwnedConnection(storage, user.id, c.req.param("cid"));
    if ("error" in conn) return c.json({ error: conn.error }, conn.status);
    const activations = await storage.storageActivations.listForConnection(conn.value.id);
    return c.json(detailFor(conn.value, activations));
  });

  app.patch("/:cid", async (c) => {
    const user = c.get("user");
    const cid = c.req.param("cid");
    const owned = await loadOwnedConnection(storage, user.id, cid);
    if ("error" in owned) return c.json({ error: owned.error }, owned.status);

    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    const validated = validatePatch(body);
    if (!validated.ok) return c.json({ error: validated.error }, 400);

    const updated = await storage.storageConnections.update(cid, validated.value);
    if (!updated) return c.json({ error: "not found" }, 404);
    const activations = await storage.storageActivations.listForConnection(cid);
    return c.json(detailFor(updated, activations));
  });

  app.delete("/:cid", async (c) => {
    const user = c.get("user");
    const cid = c.req.param("cid");
    const owned = await loadOwnedConnection(storage, user.id, cid);
    if ("error" in owned) return c.json({ error: owned.error }, owned.status);
    await storage.storageActivations.removeAllForConnection(cid);
    await storage.storageConnections.remove(cid);
    return c.body(null, 204);
  });

  app.post("/:cid/activations", async (c) => {
    const user = c.get("user");
    const cid = c.req.param("cid");
    const owned = await loadOwnedConnection(storage, user.id, cid);
    if ("error" in owned) return c.json({ error: owned.error }, owned.status);

    const body = (await c.req.json().catch(() => null)) as { spaceId?: unknown; openToGuests?: unknown } | null;
    const spaceId = typeof body?.spaceId === "string" ? body.spaceId : "";
    if (!spaceId) return c.json({ error: "spaceId is required" }, 400);
    const space = await storage.spaces.get(spaceId);
    if (!space) return c.json({ error: "space not found" }, 404);
    if (space.ownerId !== user.id) {
      return c.json({ error: "you can only activate connections in spaces you own" }, 403);
    }
    const openToGuests = typeof body?.openToGuests === "boolean" ? body.openToGuests : undefined;
    const activation = await storage.storageActivations.add({ connectionId: cid, spaceId, openToGuests });
    return c.json(activation, 201);
  });

  app.delete("/:cid/activations/:spaceId", async (c) => {
    const user = c.get("user");
    const cid = c.req.param("cid");
    const owned = await loadOwnedConnection(storage, user.id, cid);
    if ("error" in owned) return c.json({ error: owned.error }, owned.status);
    await storage.storageActivations.remove(cid, c.req.param("spaceId"));
    return c.body(null, 204);
  });

  return app;
}

// Validation lives at the route layer — the repo trusts whatever it
// gets. Split into create/patch so the return type is concrete in each
// case (a union would force every consumer to narrow per-field).
type ValidateResult<T> = { ok: true; value: T } | { ok: false; error: string };

type CreateInput = {
  label: string;
  provider: "r2";
  accountId: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl?: string;
  maxBytes: number;
};

type PatchInput = {
  label?: string;
  accountId?: string;
  bucket?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  publicBaseUrl?: string;
  maxBytes?: number;
};

function validateCreate(body: Record<string, unknown> | null): ValidateResult<CreateInput> {
  if (!body) return { ok: false, error: "invalid body" };
  const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string).trim() : "");
  const num = (k: string) => (typeof body[k] === "number" ? (body[k] as number) : undefined);

  if (body.provider !== "r2") return { ok: false, error: "provider must be 'r2'" };
  const label = str("label");
  const accountId = str("accountId");
  const bucket = str("bucket");
  const accessKeyId = str("accessKeyId");
  const secretAccessKey = str("secretAccessKey");
  if (!label) return { ok: false, error: "label is required" };
  if (!accountId) return { ok: false, error: "accountId is required" };
  if (!bucket) return { ok: false, error: "bucket is required" };
  if (!accessKeyId) return { ok: false, error: "accessKeyId is required" };
  if (!secretAccessKey) return { ok: false, error: "secretAccessKey is required" };
  const publicBaseUrl = str("publicBaseUrl") || undefined;
  const maxBytes = num("maxBytes");
  if (maxBytes === undefined || maxBytes <= 0) return { ok: false, error: "maxBytes must be a positive number" };
  return {
    ok: true,
    value: { label, provider: "r2", accountId, bucket, accessKeyId, secretAccessKey, publicBaseUrl, maxBytes },
  };
}

function validatePatch(body: Record<string, unknown> | null): ValidateResult<PatchInput> {
  if (!body) return { ok: false, error: "invalid body" };
  const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string).trim() : "");
  const num = (k: string) => (typeof body[k] === "number" ? (body[k] as number) : undefined);

  const patch: PatchInput = {};
  if (body.label !== undefined) {
    const v = str("label");
    if (!v) return { ok: false, error: "label cannot be empty" };
    patch.label = v;
  }
  if (body.accountId !== undefined) patch.accountId = str("accountId");
  if (body.bucket !== undefined) patch.bucket = str("bucket");
  if (body.accessKeyId !== undefined) patch.accessKeyId = str("accessKeyId");
  if (body.secretAccessKey !== undefined) patch.secretAccessKey = str("secretAccessKey");
  if (body.publicBaseUrl !== undefined) patch.publicBaseUrl = str("publicBaseUrl");
  if (body.maxBytes !== undefined) {
    const v = num("maxBytes");
    if (v === undefined || v <= 0) return { ok: false, error: "maxBytes must be a positive number" };
    patch.maxBytes = v;
  }
  return { ok: true, value: patch };
}

async function loadOwnedConnection(storage: Storage, ownerId: string, cid: string): Promise<{ value: StorageConnection } | { error: string; status: 403 | 404 }> {
  const conn = await storage.storageConnections.get(cid);
  if (!conn) return { error: "not found", status: 404 };
  if (conn.ownerId !== ownerId) return { error: "not yours", status: 403 };
  return { value: conn };
}

function detailFor(connection: StorageConnection, activations: import("@/protocol.ts").StorageActivation[]): StorageConnectionDetail {
  return { connection, activations };
}
