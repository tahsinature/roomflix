import { findFuzzyCandidates, searchSimilarity, type FuzzyCandidate } from "./fuzzy-search.ts";
import { tmdbRequest } from "./tmdb-client.ts";
import { isTitle, SEARCHABLE_DEPARTMENTS, toPersonResult, toSearchResult } from "./tmdb-normalizers.ts";
import type { RawPersonDetails, RawSearchItem } from "./tmdb-types.ts";
import type { DiscoverMediaType, DiscoverPersonResult, DiscoverSearchResponse, DiscoverSearchResult } from "@/protocol.ts";

const STRONG_SEARCH_MATCH = 0.82;

export async function searchWithFuzzyFallback(query: string): Promise<DiscoverSearchResponse> {
  const exact = await searchMulti(query);
  if (hasStrongSearchMatch(query, exact)) return exact;

  try {
    const candidates = await findFuzzyCandidates(query);
    const [titleResults, personResults] = await Promise.all([
      Promise.allSettled(candidates.titles.map(hydrateFuzzyTitle)),
      Promise.allSettled(candidates.people.map(hydrateFuzzyPerson)),
    ]);
    const fuzzyTitles = titleResults.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
    const fuzzyPeople = personResults.flatMap((result) => (result.status === "fulfilled" && result.value ? [result.value] : []));
    return {
      titles: mergeTitles(fuzzyTitles, exact.titles),
      people: mergePeople(fuzzyPeople, exact.people),
      usedFuzzyFallback: fuzzyTitles.length > 0 || fuzzyPeople.length > 0,
    };
  } catch {
    return exact;
  }
}

async function searchMulti(query: string): Promise<DiscoverSearchResponse> {
  const data = await tmdbRequest<{ results?: RawSearchItem[] }>("/search/multi", {
    query,
    include_adult: "true",
    page: "1",
  });
  const response: DiscoverSearchResponse = { titles: [], people: [], usedFuzzyFallback: false };
  for (const result of data.results ?? []) {
    if (isTitle(result)) response.titles.push(toSearchResult(result));
    else if (result.media_type === "person" && SEARCHABLE_DEPARTMENTS.has(result.known_for_department ?? "")) {
      response.people.push(toPersonResult(result));
    }
  }
  return response;
}

function hasStrongSearchMatch(query: string, response: DiscoverSearchResponse): boolean {
  return (
    response.titles.some((title) => searchSimilarity(query, title.title) >= STRONG_SEARCH_MATCH) ||
    response.people.some((person) => searchSimilarity(query, person.name) >= STRONG_SEARCH_MATCH)
  );
}

async function hydrateFuzzyTitle(candidate: FuzzyCandidate): Promise<DiscoverSearchResult> {
  const mediaType: DiscoverMediaType = candidate.kind === "m" ? "movie" : "tv";
  const data = await tmdbRequest<RawSearchItem>(`/${mediaType}/${candidate.id}`);
  return toSearchResult(data, mediaType);
}

async function hydrateFuzzyPerson(candidate: FuzzyCandidate): Promise<DiscoverPersonResult | null> {
  const person = await tmdbRequest<RawPersonDetails>(`/person/${candidate.id}`);
  if (!SEARCHABLE_DEPARTMENTS.has(person.known_for_department ?? "")) return null;
  return {
    tmdbId: person.id,
    name: person.name ?? candidate.name,
    profilePath: person.profile_path ?? null,
    knownForDepartment: person.known_for_department ?? "",
    knownFor: [],
  };
}

function mergeTitles(fuzzy: DiscoverSearchResult[], exact: DiscoverSearchResult[]): DiscoverSearchResult[] {
  const seen = new Set<string>();
  return [...fuzzy, ...exact].filter((title) => {
    const key = `${title.mediaType}-${title.tmdbId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function mergePeople(fuzzy: DiscoverPersonResult[], exact: DiscoverPersonResult[]): DiscoverPersonResult[] {
  const seen = new Set<number>();
  return [...fuzzy, ...exact].filter((person) => {
    if (seen.has(person.tmdbId)) return false;
    seen.add(person.tmdbId);
    return true;
  });
}
