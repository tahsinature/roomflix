export type FuzzySearchKind = "m" | "t" | "p";

export type SearchIndexEntry = [FuzzySearchKind, number, string, number];

interface SearchIndexDocument {
  version: 1;
  sourceDate: string;
  entries: SearchIndexEntry[];
}

interface PreparedEntry {
  kind: FuzzySearchKind;
  id: number;
  name: string;
  popularity: number;
  normalizedName: string;
  sortedName: string;
}

export interface FuzzyCandidate {
  kind: FuzzySearchKind;
  id: number;
  name: string;
  score: number;
}

export interface FuzzyCandidateGroups {
  titles: FuzzyCandidate[];
  people: FuzzyCandidate[];
}

const RESULTS_PER_GROUP = 4;
const MINIMUM_RESULT_SCORE = 0.62;
const TOP_SCORE_WINDOW = 0.055;
let indexPromise: Promise<PreparedEntry[]> | null = null;

export function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function sortWords(value: string): string {
  return value.split(" ").sort().join(" ");
}

function bigramSimilarity(left: string, right: string): number {
  if (left.length < 2 || right.length < 2) return left === right ? 1 : 0;

  const leftBigrams = new Map<string, number>();
  for (let index = 0; index < left.length - 1; index += 1) {
    const bigram = left.slice(index, index + 2);
    leftBigrams.set(bigram, (leftBigrams.get(bigram) ?? 0) + 1);
  }

  let overlap = 0;
  for (let index = 0; index < right.length - 1; index += 1) {
    const bigram = right.slice(index, index + 2);
    const remaining = leftBigrams.get(bigram) ?? 0;
    if (remaining === 0) continue;
    overlap += 1;
    leftBigrams.set(bigram, remaining - 1);
  }

  return (2 * overlap) / (left.length + right.length - 2);
}

function wordSimilarity(queryWord: string, candidateWord: string): number {
  if (queryWord === candidateWord) return 1;
  if (candidateWord.startsWith(queryWord)) {
    return 0.86 + Math.min(0.1, queryWord.length / candidateWord.length / 10);
  }

  const longestLength = Math.max(queryWord.length, candidateWord.length);
  if (Math.abs(queryWord.length - candidateWord.length) > 2) return 0;
  return 1 - editDistance(queryWord, candidateWord) / longestLength;
}

function tokenCoverage(query: string, candidate: string): number {
  const queryWords = query.split(" ");
  const candidateWords = candidate.split(" ");
  let total = 0;

  for (const queryWord of queryWords) {
    let best = 0;
    for (const candidateWord of candidateWords) {
      best = Math.max(best, wordSimilarity(queryWord, candidateWord));
    }
    total += best;
  }

  return total / queryWords.length;
}

/** Optimal-string-alignment distance, including adjacent transpositions. */
function editDistance(left: string, right: string): number {
  const rows = left.length + 1;
  const columns = right.length + 1;
  const matrix = Array.from({ length: rows }, () => new Array<number>(columns).fill(0));

  for (let row = 0; row < rows; row += 1) matrix[row][0] = row;
  for (let column = 0; column < columns; column += 1) {
    matrix[0][column] = column;
  }

  for (let row = 1; row < rows; row += 1) {
    for (let column = 1; column < columns; column += 1) {
      const substitutionCost = left[row - 1] === right[column - 1] ? 0 : 1;
      matrix[row][column] = Math.min(matrix[row - 1][column] + 1, matrix[row][column - 1] + 1, matrix[row - 1][column - 1] + substitutionCost);

      const isTransposition = row > 1 && column > 1 && left[row - 1] === right[column - 2] && left[row - 2] === right[column - 1];
      if (isTransposition) {
        matrix[row][column] = Math.min(matrix[row][column], matrix[row - 2][column - 2] + substitutionCost);
      }
    }
  }

  return matrix[left.length][right.length];
}

function normalizedSimilarity(normalizedQuery: string, sortedQuery: string, normalizedCandidate: string, sortedCandidate: string): number {
  if (!normalizedQuery || !normalizedCandidate) return 0;
  if (normalizedQuery === normalizedCandidate || sortedQuery === sortedCandidate) {
    return 1;
  }
  if (normalizedCandidate.startsWith(normalizedQuery)) return 0.97;
  if (normalizedCandidate.includes(` ${normalizedQuery}`)) return 0.94;

  const longestLength = Math.max(sortedQuery.length, sortedCandidate.length);
  const lengthDifference = Math.abs(sortedQuery.length - sortedCandidate.length);
  if (lengthDifference > Math.max(4, Math.ceil(longestLength * 0.55))) {
    return 0;
  }

  const bigramScore = bigramSimilarity(sortedQuery, sortedCandidate);
  if (bigramScore < 0.18) return 0;

  const distanceScore = 1 - editDistance(sortedQuery, sortedCandidate) / longestLength;
  const tokenScore = tokenCoverage(normalizedQuery, normalizedCandidate);
  return Math.max(distanceScore, bigramScore * 0.9, tokenScore * 0.96);
}

export function searchSimilarity(query: string, candidate: string): number {
  const normalizedQuery = normalizeSearchText(query);
  const normalizedCandidate = normalizeSearchText(candidate);
  return normalizedSimilarity(normalizedQuery, sortWords(normalizedQuery), normalizedCandidate, sortWords(normalizedCandidate));
}

async function loadIndex(): Promise<PreparedEntry[]> {
  const indexFile = Bun.file(new URL("../data/tmdb-search-index.json", import.meta.url));
  const document = (await indexFile.json()) as SearchIndexDocument;
  if (document.version !== 1 || !Array.isArray(document.entries)) {
    throw new Error("Fuzzy search index has an unsupported format.");
  }

  return prepareEntries(document.entries);
}

function prepareEntries(entries: SearchIndexEntry[]): PreparedEntry[] {
  return entries.map(([kind, id, name, popularity]) => {
    const normalizedName = normalizeSearchText(name);
    return {
      kind,
      id,
      name,
      popularity,
      normalizedName,
      sortedName: sortWords(normalizedName),
    };
  });
}

async function preparedIndex(): Promise<PreparedEntry[]> {
  if (!indexPromise) indexPromise = loadIndex();
  try {
    return await indexPromise;
  } catch (error) {
    indexPromise = null;
    throw error;
  }
}

function rankEntries(entries: PreparedEntry[], query: string) {
  const normalizedQuery = normalizeSearchText(query);
  const sortedQuery = sortWords(normalizedQuery);
  const minimumScore = normalizedQuery.length <= 3 ? 0.74 : 0.56;
  const matches: FuzzyCandidate[] = [];

  for (const entry of entries) {
    const similarity = normalizedSimilarity(normalizedQuery, sortedQuery, entry.normalizedName, entry.sortedName);
    if (similarity < minimumScore) continue;

    const popularityScore = Math.min(1, Math.log1p(entry.popularity) / 8);
    matches.push({
      kind: entry.kind,
      id: entry.id,
      name: entry.name,
      score: similarity * 0.92 + popularityScore * 0.08,
    });
  }

  return matches.sort((a, b) => b.score - a.score);
}

function groupCandidates(ranked: FuzzyCandidate[]): FuzzyCandidateGroups {
  const titles: FuzzyCandidate[] = [];
  const people: FuzzyCandidate[] = [];
  const resultThreshold = Math.max(MINIMUM_RESULT_SCORE, (ranked[0]?.score ?? 0) - TOP_SCORE_WINDOW);

  for (const candidate of ranked) {
    if (candidate.score < resultThreshold) break;
    const group = candidate.kind === "p" ? people : titles;
    if (group.length < RESULTS_PER_GROUP) group.push(candidate);
    if (titles.length === RESULTS_PER_GROUP && people.length === RESULTS_PER_GROUP) {
      break;
    }
  }

  return { titles, people };
}

export function findFuzzyCandidatesInEntries(entries: SearchIndexEntry[], query: string): FuzzyCandidateGroups {
  return groupCandidates(rankEntries(prepareEntries(entries), query));
}

export async function findFuzzyCandidates(query: string): Promise<FuzzyCandidateGroups> {
  return groupCandidates(rankEntries(await preparedIndex(), query));
}
