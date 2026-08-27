import { Hono } from "hono";

import { requireUser } from "@/auth.ts";
import { tmdbRequest, TmdbGatewayError } from "@/discovery/tmdb-client.ts";
import { isTitle, toEpisodeDetails, toImageGallery, toPersonDetails, toSearchResult, toSeasonDetails, toTitleDetails } from "@/discovery/tmdb-normalizers.ts";
import { searchWithFuzzyFallback } from "@/discovery/tmdb-search.ts";
import type { RawEpisodeDetails, RawPersonDetails, RawSearchItem, RawSeasonDetails, RawTitleDetails } from "@/discovery/tmdb-types.ts";
import type { DiscoverGenre, DiscoverMediaType, DiscoverSearchResponse } from "@/protocol.ts";
import type { Storage } from "@/storage/index.ts";

export function buildDiscoverTmdbRouter(storage: Storage) {
  const app = new Hono();
  app.use("*", requireUser(storage));
  app.onError((error, c) => {
    if (error instanceof TmdbGatewayError) {
      if (error.status === 401) return c.json({ error: error.message }, 401);
      if (error.status === 404) return c.json({ error: error.message }, 404);
      if (error.status === 429) return c.json({ error: error.message }, 429);
      if (error.status === 503) return c.json({ error: error.message }, 503);
      return c.json({ error: error.message }, 502);
    }
    return c.json({ error: "The discovery service failed unexpectedly." }, 500);
  });

  app.get("/search", async (c) => {
    const query = c.req.query("q")?.trim() ?? "";
    if (query.length < 2) return c.json({ titles: [], people: [], usedFuzzyFallback: false } satisfies DiscoverSearchResponse);
    return c.json(await searchWithFuzzyFallback(query));
  });

  app.get("/trending", async (c) => {
    const data = await tmdbRequest<{ results?: RawSearchItem[] }>("/trending/all/week");
    return c.json(
      (data.results ?? [])
        .filter(isTitle)
        .map((item) => toSearchResult(item))
        .slice(0, 18),
    );
  });

  app.get("/genres/:mediaType", async (c) => {
    const mediaType = parseMediaType(c.req.param("mediaType"));
    if (!mediaType) return c.json({ error: "invalid media type" }, 400);
    const data = await tmdbRequest<{ genres?: DiscoverGenre[] }>(`/genre/${mediaType}/list`);
    return c.json(data.genres ?? []);
  });

  app.get("/genre/:mediaType/:genreId", async (c) => {
    const mediaType = parseMediaType(c.req.param("mediaType"));
    const genreId = parsePositiveInt(c.req.param("genreId"));
    if (!mediaType || !genreId) return c.json({ error: "invalid genre selection" }, 400);
    const minimumVotes = Math.min(100_000, Math.max(0, Number(c.req.query("minimumVotes")) || 0));
    const data = await tmdbRequest<{ results?: RawSearchItem[] }>(`/discover/${mediaType}`, {
      with_genres: String(genreId),
      sort_by: "popularity.desc",
      include_adult: "true",
      "vote_count.gte": String(minimumVotes),
      page: "1",
    });
    return c.json((data.results ?? []).map((item) => toSearchResult(item, mediaType)).slice(0, 18));
  });

  app.get("/title/:mediaType/:tmdbId", async (c) => {
    const mediaType = parseMediaType(c.req.param("mediaType"));
    const tmdbId = parsePositiveInt(c.req.param("tmdbId"));
    if (!mediaType || !tmdbId) return c.json({ error: "invalid TMDB title identity" }, 400);
    const data = await tmdbRequest<RawTitleDetails>(`/${mediaType}/${tmdbId}`, {
      append_to_response: `credits,external_ids,recommendations,videos,watch/providers,${mediaType === "movie" ? "release_dates" : "content_ratings"}`,
    });
    return c.json(toTitleDetails(data, mediaType));
  });

  app.get("/title/tv/:tmdbId/season/:seasonNumber", async (c) => {
    const tmdbId = parsePositiveInt(c.req.param("tmdbId"));
    const seasonNumber = parseNonNegativeInt(c.req.param("seasonNumber"));
    if (!tmdbId || seasonNumber === null) return c.json({ error: "invalid TMDB season identity" }, 400);
    const data = await tmdbRequest<RawSeasonDetails>(`/tv/${tmdbId}/season/${seasonNumber}`);
    return c.json(toSeasonDetails(data));
  });

  app.get("/title/tv/:tmdbId/season/:seasonNumber/episode/:episodeNumber", async (c) => {
    const tmdbId = parsePositiveInt(c.req.param("tmdbId"));
    const seasonNumber = parseNonNegativeInt(c.req.param("seasonNumber"));
    const episodeNumber = parsePositiveInt(c.req.param("episodeNumber"));
    if (!tmdbId || seasonNumber === null || !episodeNumber) return c.json({ error: "invalid TMDB episode identity" }, 400);
    const data = await tmdbRequest<RawEpisodeDetails>(`/tv/${tmdbId}/season/${seasonNumber}/episode/${episodeNumber}`, {
      append_to_response: "credits,external_ids",
    });
    return c.json(toEpisodeDetails(data, tmdbId));
  });

  app.get("/title/:mediaType/:tmdbId/images", async (c) => {
    const mediaType = parseMediaType(c.req.param("mediaType"));
    const tmdbId = parsePositiveInt(c.req.param("tmdbId"));
    if (!mediaType || !tmdbId) return c.json({ error: "invalid TMDB title identity" }, 400);
    const data = await tmdbRequest<RawTitleDetails>(`/${mediaType}/${tmdbId}`, { append_to_response: "images" });
    return c.json(toImageGallery(data.title ?? data.name ?? "Untitled", mediaType, data.images));
  });

  app.get("/person/:tmdbId", async (c) => {
    const tmdbId = parsePositiveInt(c.req.param("tmdbId"));
    if (!tmdbId) return c.json({ error: "invalid TMDB person identity" }, 400);
    const data = await tmdbRequest<RawPersonDetails>(`/person/${tmdbId}`, { append_to_response: "combined_credits" });
    return c.json(toPersonDetails(data));
  });

  app.get("/person/:tmdbId/images", async (c) => {
    const tmdbId = parsePositiveInt(c.req.param("tmdbId"));
    if (!tmdbId) return c.json({ error: "invalid TMDB person identity" }, 400);
    const data = await tmdbRequest<RawPersonDetails>(`/person/${tmdbId}`, { append_to_response: "images" });
    return c.json(toImageGallery(data.name ?? "Unknown person", "person", data.images));
  });

  return app;
}

function parseMediaType(value: string): DiscoverMediaType | null {
  return value === "movie" || value === "tv" ? value : null;
}

function parsePositiveInt(value: string): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseNonNegativeInt(value: string): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}
