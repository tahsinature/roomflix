import { Hono } from "hono";

import type { SecretExchangeRequest } from "@/protocol.ts";
import type { Storage } from "@/storage/index.ts";
import { getCurrentPrincipal } from "@/auth.ts";
import { encryptForClient } from "@/crypto.ts";
import type { EcdhPublicJwk } from "@/protocol.ts";

// POST /api/storage/secret/:cid
//
// ECDH secret exchange for a storage connection. Authorized for:
//   - the connection's owner
//   - a real user who is a member of any space where this connection
//     is activated (regardless of guests flag — members admit themselves)
//   - a guest whose currentSpaceId has an activation for this
//     connection with openToGuests = true
//
// Separate from the rest of the account-storage routes so guests can
// hit it without the requireUser middleware rejecting them.
export function buildStorageSecretRouter(storage: Storage) {
  const app = new Hono();

  app.post("/:cid", async (c) => {
    const principal = await getCurrentPrincipal(c, storage);
    if (!principal) return c.json({ error: "unauthorized" }, 401);

    const cid = c.req.param("cid");
    if (!cid) return c.json({ error: "connection id is required" }, 400);
    const conn = await storage.storageConnections.get(cid);
    if (!conn) return c.json({ error: "not found" }, 404);

    let allowed = false;
    if (principal.kind === "user") {
      if (conn.ownerId === principal.user.id) {
        allowed = true;
      } else {
        // Member path: allowed if this connection is activated in any
        // space the caller is a member of. (Member-level activation is
        // implied by the activation existing — openToGuests doesn't
        // restrict members, it only widens to guests.)
        const memberships = await storage.memberships.listForUser(principal.user.id);
        const memberSpaceIds = new Set(memberships.map((m) => m.spaceId));
        const activations = await storage.storageActivations.listForConnection(cid);
        allowed = activations.some((a) => memberSpaceIds.has(a.spaceId));
      }
    } else {
      // Guest path. Allowed if the connection is activated in the
      // guest's current space with the openToGuests flag set.
      const spaceId = principal.session.currentSpaceId;
      if (spaceId) {
        const activations = await storage.storageActivations.listForSpace(spaceId);
        allowed = activations.some((a) => a.connectionId === cid && a.openToGuests);
      }
    }
    if (!allowed) return c.json({ error: "no access" }, 403);

    const body = (await c.req.json().catch(() => null)) as SecretExchangeRequest | null;
    if (!body?.clientPub || !isEcdhPub(body.clientPub)) {
      return c.json({ error: "missing or invalid clientPub" }, 400);
    }
    const secret = await storage.storageConnections.getSecret(cid);
    if (secret === null) return c.json({ error: "not found" }, 404);
    const enc = await encryptForClient(secret, body.clientPub);
    return c.json(enc);
  });

  return app;
}

function isEcdhPub(v: unknown): v is EcdhPublicJwk {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return o.kty === "EC" && o.crv === "P-256" && typeof o.x === "string" && typeof o.y === "string";
}
