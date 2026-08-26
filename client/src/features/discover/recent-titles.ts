import { RECENT_TITLE_LIMIT, type RecentTitleItem } from "@shared/protocol";
import { titleIdentity } from "./discover-utils";

export type RecentRange = "all" | "week" | "month" | "year";
export type RecentSort = "newest" | "oldest" | "title" | "most-viewed";

type RecentFilters = {
  query: string;
  range: RecentRange;
  sort: RecentSort;
  now?: number;
};

const RANGE_DURATION: Record<Exclude<RecentRange, "all">, number> = {
  week: 7 * 24 * 60 * 60 * 1_000,
  month: 30 * 24 * 60 * 60 * 1_000,
  year: 365 * 24 * 60 * 60 * 1_000,
};

export function mergeRecentTitleLists(current: RecentTitleItem[], incoming: RecentTitleItem[]): RecentTitleItem[] {
  const merged = new Map(current.map((title) => [titleIdentity(title), title]));
  for (const title of incoming) {
    const existing = merged.get(titleIdentity(title));
    if (!existing || title.lastViewedAt > existing.lastViewedAt || (title.lastViewedAt === existing.lastViewedAt && title.viewCount > existing.viewCount)) {
      merged.set(titleIdentity(title), title);
    }
  }
  return [...merged.values()].sort((left, right) => right.lastViewedAt - left.lastViewedAt).slice(0, RECENT_TITLE_LIMIT);
}

export function mergeRecordedRecentTitle(current: RecentTitleItem[], recorded: RecentTitleItem): RecentTitleItem[] {
  return mergeRecentTitleLists(current, [recorded]);
}

export function filterAndSortRecentTitles(titles: RecentTitleItem[], { query, range, sort, now = Date.now() }: RecentFilters): RecentTitleItem[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const cutoff = range === "all" ? 0 : now - RANGE_DURATION[range];
  const filtered = titles.filter((title) => {
    if (title.lastViewedAt < cutoff) return false;
    if (!normalizedQuery) return true;
    return `${title.title} ${title.year} ${title.mediaType}`.toLocaleLowerCase().includes(normalizedQuery);
  });

  return filtered.sort((left, right) => {
    if (sort === "oldest") return left.lastViewedAt - right.lastViewedAt;
    if (sort === "title") return left.title.localeCompare(right.title, undefined, { sensitivity: "base" });
    if (sort === "most-viewed") return right.viewCount - left.viewCount || right.lastViewedAt - left.lastViewedAt;
    return right.lastViewedAt - left.lastViewedAt;
  });
}
