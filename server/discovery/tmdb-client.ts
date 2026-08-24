const TMDB_API_BASE = "https://api.themoviedb.org/3";

export async function tmdbRequest<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const apiKey = process.env.TMDB_API_KEY?.trim();
  if (!apiKey) {
    throw new TmdbGatewayError("TMDB is not configured on the Roomflix server. Add TMDB_API_KEY.", 503);
  }

  const url = new URL(`${TMDB_API_BASE}${path}`);
  url.searchParams.set("api_key", apiKey);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

  const response = await fetch(url);
  if (!response.ok) {
    const message =
      response.status === 401
        ? "The Roomflix TMDB credential is invalid."
        : response.status === 429
          ? "TMDB rate limit reached. Try again shortly."
          : `TMDB request failed (${response.status}).`;
    throw new TmdbGatewayError(message, response.status);
  }
  return (await response.json()) as T;
}

export class TmdbGatewayError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "TmdbGatewayError";
  }
}
