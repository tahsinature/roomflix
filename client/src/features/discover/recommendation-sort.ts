import type { DiscoverSearchResult } from "@shared/protocol";

export type RecommendationSort = "recommended" | "rating" | "newest" | "oldest" | "title";

export function sortRecommendations(titles: DiscoverSearchResult[], sort: RecommendationSort): DiscoverSearchResult[] {
  if (sort === "recommended") return titles;

  return [...titles].sort((left, right) => {
    if (sort === "rating") return right.voteAverage - left.voteAverage || right.voteCount - left.voteCount;
    if (sort === "title") return left.title.localeCompare(right.title, undefined, { sensitivity: "base" });
    return compareReleaseDates(left.releaseDate, right.releaseDate, sort === "newest");
  });
}

function compareReleaseDates(left: string, right: string, newestFirst: boolean): number {
  if (!left) return right ? 1 : 0;
  if (!right) return -1;
  return newestFirst ? right.localeCompare(left) : left.localeCompare(right);
}
