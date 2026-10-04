const MAX_RECENT_SEARCHES = 8;

export function normalizeSearchTerm(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function addRecentSearch(terms: string[], query: string): string[] {
  const term = normalizeSearchTerm(query);
  if (term.length < 2 || term.length > 200) return terms;
  return [term, ...terms.filter((previous) => previous.toLocaleLowerCase() !== term.toLocaleLowerCase())].slice(0, MAX_RECENT_SEARCHES);
}

export function decodeRecentSearches(raw: string | null): string[] {
  try {
    const parsed: unknown = JSON.parse(raw ?? "[]");
    if (!Array.isArray(parsed)) return [];
    // Stored order is newest first; inserting from the end preserves it.
    return parsed.reduceRight<string[]>((terms, value) => (typeof value === "string" ? addRecentSearch(terms, value) : terms), []);
  } catch {
    return [];
  }
}
