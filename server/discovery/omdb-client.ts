import type { ImdbRatings } from "@/protocol.ts";

const DAY_MS = 24 * 60 * 60 * 1000;
const RETRY_MS = 5 * 60 * 1000;
const unavailable = (status: ImdbRatings["status"]): ImdbRatings => ({ rating: null, votes: null, status, fetchedAt: null });

export function createOmdbClient({ apiKey = () => process.env.OMDB_API_KEY?.trim(), fetcher = fetch, now = Date.now } = {}) {
  const cache = new Map<string, { data: ImdbRatings; expiresAt: number }>();
  const pending = new Map<string, Promise<ImdbRatings>>();
  let quotaRetryAt = 0;

  async function request(imdbId: string, key: string): Promise<ImdbRatings> {
    try {
      const url = new URL("https://www.omdbapi.com/");
      url.searchParams.set("apikey", key);
      url.searchParams.set("i", imdbId);
      const response = await fetcher(url, { signal: AbortSignal.timeout(8000) });
      const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      const providerError = typeof body.Error === "string" ? body.Error : "";
      if (response.status === 429 || /limit/i.test(providerError)) {
        quotaRetryAt = now() + 60 * 60 * 1000;
        return unavailable("quota_exceeded");
      }
      if (response.status === 401 || response.status === 403 || /api key/i.test(providerError)) return unavailable("invalid_key");
      if (!response.ok) return unavailable("unavailable");
      if (body.Response !== "True") return unavailable(providerError === "Movie not found!" ? "not_found" : "unavailable");
      if (body.imdbID !== imdbId) return unavailable("unavailable");
      const rating = typeof body.imdbRating === "string" && /^\d+(\.\d+)?$/.test(body.imdbRating) ? Number(body.imdbRating) : null;
      const votesText = typeof body.imdbVotes === "string" ? body.imdbVotes.replaceAll(",", "") : "";
      const votes = /^\d+$/.test(votesText) && Number.isSafeInteger(Number(votesText)) ? Number(votesText) : null;
      const validRating = rating !== null && rating >= 0 && rating <= 10 ? rating : null;
      return { rating: validRating, votes, status: validRating === null && votes === null ? "not_found" : "available", fetchedAt: new Date(now()).toISOString() };
    } catch {
      return unavailable("unavailable");
    }
  }

  return async (imdbId: string): Promise<ImdbRatings> => {
    if (!/^tt\d{7,10}$/.test(imdbId)) return unavailable("not_found");
    const key = apiKey();
    if (!key) return unavailable("not_configured");
    const cached = cache.get(imdbId);
    if (cached && cached.expiresAt > now()) return cached.data;
    const inFlight = pending.get(imdbId);
    if (inFlight) return inFlight;
    if (quotaRetryAt > now()) return unavailable("quota_exceeded");
    const promise = request(imdbId, key)
      .then((data) => {
        if (cache.size >= 2000) cache.delete(cache.keys().next().value!);
        cache.set(imdbId, { data, expiresAt: now() + (data.status === "available" ? DAY_MS : data.status === "not_found" ? 60 * 60 * 1000 : RETRY_MS) });
        return data;
      })
      .finally(() => pending.delete(imdbId));
    pending.set(imdbId, promise);
    return promise;
  };
}

export const loadImdbRatings = createOmdbClient();
