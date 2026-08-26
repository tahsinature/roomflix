import { Hono } from "hono";

import { requireUser } from "@/auth.ts";
import { RECENT_TITLE_LIMIT, type DiscoverMediaType } from "@/protocol.ts";
import type { Storage } from "@/storage/index.ts";
import type { RecentTitleInput } from "@/storage/types.ts";

const VALID_MEDIA_TYPES = new Set<DiscoverMediaType>(["movie", "tv"]);

export function buildRecentTitlesRouter(storage: Storage) {
  const app = new Hono();
  app.use("*", requireUser(storage));

  app.get("/", async (c) => {
    return c.json(await storage.recentTitles.list(c.get("user").id, RECENT_TITLE_LIMIT));
  });

  app.put("/:mediaType/:tmdbId", async (c) => {
    const identity = parseIdentity(c.req.param("mediaType"), c.req.param("tmdbId"));
    if (!identity) return c.json({ error: "invalid TMDB title identity" }, 400);

    const body = await c.req.json().catch(() => null);
    const input = parseRecentTitleInput(body, identity);
    if (!input) return c.json({ error: "invalid recent title" }, 400);

    return c.json(await storage.recentTitles.record(c.get("user").id, input));
  });

  app.delete("/", async (c) => {
    const deleted = await storage.recentTitles.removeAll(c.get("user").id);
    return c.json({ deleted });
  });

  return app;
}

export function parseRecentTitleInput(raw: unknown, identity: { mediaType: DiscoverMediaType; tmdbId: number }): RecentTitleInput | null {
  const item = asRecord(raw);
  const title = typeof item?.title === "string" ? item.title.trim().slice(0, 500) : "";
  if (!item || !title) return null;

  return {
    ...identity,
    title,
    year: stringValue(item.year, 32),
    releaseDate: stringValue(item.releaseDate, 32),
    overview: stringValue(item.overview, 20_000),
    posterPath: nullableString(item.posterPath, 2_048),
    backdropPath: nullableString(item.backdropPath, 2_048),
    voteAverage: numberValue(item.voteAverage),
    voteCount: numberValue(item.voteCount),
    adult: item.adult === true,
  };
}

function parseIdentity(rawMediaType: unknown, rawTmdbId: unknown): { mediaType: DiscoverMediaType; tmdbId: number } | null {
  if (!VALID_MEDIA_TYPES.has(rawMediaType as DiscoverMediaType)) return null;
  const tmdbId = Number(rawTmdbId);
  if (!Number.isSafeInteger(tmdbId) || tmdbId <= 0) return null;
  return { mediaType: rawMediaType as DiscoverMediaType, tmdbId };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function stringValue(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.slice(0, maxLength) : "";
}

function nullableString(value: unknown, maxLength: number): string | null {
  return typeof value === "string" && value.length > 0 ? value.slice(0, maxLength) : null;
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
