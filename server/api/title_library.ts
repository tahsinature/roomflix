import { Hono } from "hono";

import { requireUser } from "@/auth.ts";
import type { DiscoverMediaType, TitleLibraryItem, TitleLibraryStatus } from "@/protocol.ts";
import type { Storage } from "@/storage/index.ts";
import type { TitleLibraryInput } from "@/storage/types.ts";

const VALID_STATUSES = new Set<TitleLibraryStatus>(["shortlist", "watched"]);
const VALID_MEDIA_TYPES = new Set<DiscoverMediaType>(["movie", "tv"]);
const MAX_IMPORT_ITEMS = 2_000;

export function buildTitleLibraryRouter(storage: Storage) {
  const app = new Hono();
  app.use("*", requireUser(storage));

  app.get("/", async (c) => {
    const rawStatus = c.req.query("status");
    const status = VALID_STATUSES.has(rawStatus as TitleLibraryStatus) ? (rawStatus as TitleLibraryStatus) : undefined;
    return c.json(await storage.titleLibrary.list(c.get("user").id, status));
  });

  app.put("/:mediaType/:tmdbId", async (c) => {
    const identity = parseIdentity(c.req.param("mediaType"), c.req.param("tmdbId"));
    if (!identity) return c.json({ error: "invalid TMDB title identity" }, 400);

    const body = await c.req.json().catch(() => null);
    const input = parseTitleLibraryInput(body, identity);
    if (!input) return c.json({ error: "invalid title library item" }, 400);

    return c.json(await storage.titleLibrary.upsert(c.get("user").id, input));
  });

  app.delete("/:mediaType/:tmdbId", async (c) => {
    const identity = parseIdentity(c.req.param("mediaType"), c.req.param("tmdbId"));
    if (!identity) return c.json({ error: "invalid TMDB title identity" }, 400);
    const removed = await storage.titleLibrary.remove(c.get("user").id, identity.mediaType, identity.tmdbId);
    return removed ? c.body(null, 204) : c.json({ error: "not found" }, 404);
  });

  app.post("/import", async (c) => {
    const body = (await c.req.json().catch(() => null)) as { items?: unknown } | null;
    if (!Array.isArray(body?.items)) {
      return c.json({ error: "items must be an array" }, 400);
    }
    if (body.items.length > MAX_IMPORT_ITEMS) {
      return c.json({ error: `imports are limited to ${MAX_IMPORT_ITEMS} titles` }, 413);
    }

    const valid: TitleLibraryInput[] = [];
    let skipped = 0;
    for (const raw of body.items) {
      const record = asRecord(raw);
      const identity = parseIdentity(record?.mediaType, record?.tmdbId ?? record?.id);
      const parsed = identity ? parseTitleLibraryInput(raw, identity) : null;
      if (parsed) valid.push(parsed);
      else skipped++;
    }

    const imported: TitleLibraryItem[] = [];
    for (const item of valid) {
      imported.push(await storage.titleLibrary.upsert(c.get("user").id, item));
    }
    return c.json({ imported: imported.length, skipped, items: imported });
  });

  return app;
}

function parseIdentity(rawMediaType: unknown, rawTmdbId: unknown): { mediaType: DiscoverMediaType; tmdbId: number } | null {
  if (!VALID_MEDIA_TYPES.has(rawMediaType as DiscoverMediaType)) return null;
  const tmdbId = Number(rawTmdbId);
  if (!Number.isInteger(tmdbId) || tmdbId <= 0) return null;
  return { mediaType: rawMediaType as DiscoverMediaType, tmdbId };
}

function parseTitleLibraryInput(raw: unknown, identity: { mediaType: DiscoverMediaType; tmdbId: number }): TitleLibraryInput | null {
  const item = asRecord(raw);
  const title = typeof item?.title === "string" ? item.title.trim() : "";
  const status = VALID_STATUSES.has(item?.status as TitleLibraryStatus) ? (item?.status as TitleLibraryStatus) : null;
  if (!item || !title || !status) return null;

  const rating = nullableNumber(item.userRating);
  return {
    ...identity,
    title,
    year: stringValue(item.year),
    posterPath: nullableString(item.posterPath),
    backdropPath: nullableString(item.backdropPath),
    overview: stringValue(item.overview),
    voteAverage: numberValue(item.voteAverage),
    voteCount: numberValue(item.voteCount),
    genres: Array.isArray(item.genres) ? item.genres.filter((genre): genre is string => typeof genre === "string") : [],
    runtime: nullableNumber(item.runtime),
    imdbId: nullableString(item.imdbId),
    status,
    userRating: rating !== null && rating >= 1 && rating <= 5 ? rating : null,
    notes: stringValue(item.notes).slice(0, 10_000),
    watchedAt: nullableNumber(item.watchedAt),
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function nullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
