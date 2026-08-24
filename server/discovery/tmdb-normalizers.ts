import type {
  DiscoverMediaType,
  DiscoverPersonDetails,
  DiscoverPersonResult,
  DiscoverRegionProviders,
  DiscoverSearchResult,
  DiscoverTitleDetails,
  DiscoverTrailer,
  DiscoverWatchProvider,
} from "@/protocol.ts";
import type { RawCertificationResult, RawPersonDetails, RawRegionProviders, RawSearchItem, RawTitleDetails, RawVideo, RawWatchProvider } from "./tmdb-types.ts";

export const SEARCHABLE_DEPARTMENTS = new Set(["Acting", "Directing", "Production"]);

export function isTitle(item: RawSearchItem): boolean {
  return item.media_type === "movie" || item.media_type === "tv";
}

export function toSearchResult(item: RawSearchItem, forcedMediaType?: DiscoverMediaType): DiscoverSearchResult {
  const mediaType = forcedMediaType ?? (item.media_type === "tv" ? "tv" : "movie");
  const releaseDate = item.release_date ?? item.first_air_date ?? "";
  return {
    tmdbId: item.id,
    mediaType,
    title: item.title ?? item.name ?? "Untitled",
    year: releaseDate.slice(0, 4),
    releaseDate,
    overview: item.overview ?? "",
    posterPath: item.poster_path ?? null,
    backdropPath: item.backdrop_path ?? null,
    voteAverage: item.vote_average ?? 0,
    voteCount: item.vote_count ?? 0,
    adult: item.adult ?? false,
  };
}

export function toPersonResult(item: RawSearchItem): DiscoverPersonResult {
  return {
    tmdbId: item.id,
    name: item.name ?? "Unknown person",
    profilePath: item.profile_path ?? null,
    knownForDepartment: item.known_for_department ?? "",
    knownFor: (item.known_for ?? []).filter(isTitle).map((title) => toSearchResult(title)),
  };
}

export function toTitleDetails(item: RawTitleDetails, mediaType: DiscoverMediaType): DiscoverTitleDetails {
  const crew = item.credits?.crew ?? [];
  const directors =
    mediaType === "movie"
      ? crew.filter((credit) => credit.job === "Director").map((credit) => ({ tmdbId: credit.id, name: credit.name ?? "Unknown" }))
      : (item.created_by ?? []).map((credit) => ({ tmdbId: credit.id, name: credit.name }));
  return {
    ...toSearchResult(item, mediaType),
    originalTitle: item.original_title ?? item.original_name ?? "",
    tagline: item.tagline ?? "",
    runtime: mediaType === "movie" ? (item.runtime ?? null) : (item.episode_run_time?.[0] ?? null),
    genres: (item.genres ?? []).map((genre) => genre.name ?? "").filter(Boolean),
    spokenLanguages: (item.spoken_languages ?? []).map((language) => language.english_name ?? language.name ?? "").filter(Boolean),
    originalLanguage: item.original_language ?? "",
    status: item.status ?? "",
    imdbId: item.external_ids?.imdb_id ?? null,
    directors,
    cast: (item.credits?.cast ?? []).slice(0, 14).map((credit) => ({
      tmdbId: credit.id,
      name: credit.name ?? "Unknown",
      character: credit.character ?? "",
      profilePath: credit.profile_path ?? null,
    })),
    recommendations: (item.recommendations?.results ?? []).map((result) => toSearchResult(result, mediaType)).slice(0, 12),
    numberOfSeasons: item.number_of_seasons ?? null,
    numberOfEpisodes: item.number_of_episodes ?? null,
    trailers: normalizeTrailers(item.videos?.results),
    watchProviders: normalizeWatchProviders(item["watch/providers"]?.results),
    certifications: normalizeCertifications(
      mediaType === "movie" ? item.release_dates?.results : item.content_ratings?.results,
      mediaType,
    ),
  };
}

export function toPersonDetails(person: RawPersonDetails): DiscoverPersonDetails {
  const cast = person.combined_credits?.cast ?? [];
  const crew = person.combined_credits?.crew ?? [];
  const byAudience = (left: RawSearchItem, right: RawSearchItem) => (right.vote_count ?? 0) - (left.vote_count ?? 0);
  const uniqueTitles = (credits: RawSearchItem[]) => {
    const seen = new Set<string>();
    return credits
      .filter(isTitle)
      .sort(byAudience)
      .filter((credit) => {
        const key = `${credit.media_type}-${credit.id}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((credit) => toSearchResult(credit));
  };
  return {
    tmdbId: person.id,
    name: person.name ?? "Unknown person",
    profilePath: person.profile_path ?? null,
    knownForDepartment: person.known_for_department ?? "",
    biography: person.biography ?? "",
    actingCredits: uniqueTitles(cast),
    creativeCredits: uniqueTitles(crew.filter((credit) => credit.job === "Director" || credit.job === "Creator")),
    productionCredits: uniqueTitles(crew.filter((credit) => credit.department === "Production" || credit.job?.includes("Producer"))),
  };
}

function normalizeTrailers(videos: RawVideo[] = []): DiscoverTrailer[] {
  const priority = (video: RawVideo) => {
    const typeRank = video.type === "Trailer" ? 0 : video.type === "Teaser" ? 1 : 2;
    return (video.official ? 0 : 0.5) + typeRank;
  };
  return videos
    .filter((video) => video.site === "YouTube" && ["Trailer", "Teaser", "Clip"].includes(video.type))
    .sort((left, right) => priority(left) - priority(right))
    .slice(0, 8)
    .map((video) => ({ id: video.id, youtubeKey: video.key, name: video.name, type: video.type, official: video.official }));
}

function normalizeWatchProviders(raw: Record<string, RawRegionProviders> = {}): Record<string, DiscoverRegionProviders> {
  return Object.fromEntries(
    Object.entries(raw).map(([region, providers]) => [
      region,
      {
        link: providers.link ?? "",
        stream: normalizeProviderList(providers.flatrate),
        free: normalizeProviderList(providers.free),
        ads: normalizeProviderList(providers.ads),
        rent: normalizeProviderList(providers.rent),
        buy: normalizeProviderList(providers.buy),
      },
    ]),
  );
}

function normalizeProviderList(providers: RawWatchProvider[] = []): DiscoverWatchProvider[] {
  return providers.map((provider) => ({ providerId: provider.provider_id, name: provider.provider_name, logoPath: provider.logo_path ?? null }));
}

function normalizeCertifications(results: RawCertificationResult[] = [], mediaType: DiscoverMediaType): Record<string, string> {
  const entries = results.flatMap((result) => {
    const region = result.iso_3166_1?.trim();
    const certification =
      mediaType === "movie"
        ? result.release_dates?.find((release) => release.certification?.trim())?.certification?.trim()
        : result.rating?.trim();
    return region && certification ? [[region, certification] as const] : [];
  });
  return Object.fromEntries(entries);
}
