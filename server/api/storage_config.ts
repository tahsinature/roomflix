import { Hono } from "hono";

import type { StorageConfig } from "@/protocol.ts";
import type { Storage } from "@/storage/index.ts";
import { requireSpaceMember, requireSpaceOwner } from "@/auth.ts";

// REST routes for the per-space storage backend config. Reads are
// available to any space member (the bucket file browser needs the
// creds); writes/deletes are owner-only — members can't reconfigure or
// remove someone else's R2 setup.
//   GET    /api/storage/config           → StorageConfig | null   (member)
//   PUT    /api/storage/config           replace; body = StorageConfig (owner)
//   DELETE /api/storage/config           clear (owner)
export function buildStorageConfigRouter(storage: Storage) {
  const app = new Hono();
  app.use("*", requireSpaceMember(storage));

  app.get("/", async (c) => {
    const config = await storage.storageConfigs.get(c.get("space").id);
    return c.json(config);
  });

  app.put("/", requireSpaceOwner(), async (c) => {
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    const parsed = parseStorageConfig(body);
    if (!parsed.ok) return c.json({ error: parsed.error }, 400);

    const saved = await storage.storageConfigs.put(c.get("space").id, parsed.value);
    return c.json(saved);
  });

  app.delete("/", requireSpaceOwner(), async (c) => {
    await storage.storageConfigs.remove(c.get("space").id);
    return c.body(null, 204);
  });

  return app;
}

type ParseResult = { ok: true; value: Omit<StorageConfig, "updatedAt"> } | { ok: false; error: string };

function parseStorageConfig(raw: Record<string, unknown> | null): ParseResult {
  if (!raw) return { ok: false, error: "invalid body" };

  if (raw.provider !== "r2") return { ok: false, error: "provider must be 'r2'" };
  const accountId = stringField(raw.accountId);
  const accessKeyId = stringField(raw.accessKeyId);
  const secretAccessKey = stringField(raw.secretAccessKey);
  const bucket = stringField(raw.bucket);
  const publicBaseUrl = optionalString(raw.publicBaseUrl);
  const label = optionalString(raw.label);
  const maxBytes = typeof raw.maxBytes === "number" && raw.maxBytes > 0 ? raw.maxBytes : null;

  if (!accountId) return { ok: false, error: "accountId is required" };
  if (!accessKeyId) return { ok: false, error: "accessKeyId is required" };
  if (!secretAccessKey) return { ok: false, error: "secretAccessKey is required" };
  if (!bucket) return { ok: false, error: "bucket is required" };
  if (maxBytes === null) return { ok: false, error: "maxBytes must be a positive number" };

  return {
    ok: true,
    value: {
      provider: "r2",
      accountId,
      accessKeyId,
      secretAccessKey,
      bucket,
      publicBaseUrl,
      label,
      maxBytes,
    },
  };
}

function stringField(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function optionalString(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const trimmed = v.trim();
  return trimmed ? trimmed : undefined;
}
