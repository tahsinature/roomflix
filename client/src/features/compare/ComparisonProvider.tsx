import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import type { DiscoverSearchResult } from "@shared/protocol";
import { useAuth } from "@/auth/AuthContext";
import { titleIdentity } from "@/features/discover/discover-utils";
import { loadImdbRatings } from "@/features/discover/imdb-ratings-cache";
import { loadTitleDetails } from "@/features/discover/title-details-cache";
import { loadComparisonTitle } from "./comparison-data";
import { useComparisonList } from "./use-comparison-list";

type ComparisonContextValue = ReturnType<typeof useComparisonList> & {
  enabled: boolean;
  refreshTitles: () => Promise<void>;
  addedIds: Set<string>;
  addedAtById: Map<string, number | null>;
  addingIds: Set<string>;
  addSelection: (selection: DiscoverSearchResult) => Promise<void>;
};

const ComparisonContext = createContext<ComparisonContextValue | null>(null);

export function ComparisonProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return (
    <AccountComparisonProvider key={user?.id ?? "signed-out"} userId={user?.id ?? null}>
      {children}
    </AccountComparisonProvider>
  );
}

function AccountComparisonProvider({ userId, children }: { userId: string | null; children: ReactNode }) {
  const list = useComparisonList(userId);
  const { titles, addTitle, updateRatings, updateDetails } = list;
  const currentTitles = useRef(titles);
  currentTitles.current = titles;
  const refreshTitles = useCallback(async () => {
    await Promise.all(
      currentTitles.current.map(async (title) => {
        const ratings = loadImdbRatings(title.imdbId).then((data) => updateRatings(title.id, data));
        const details = loadTitleDetails(title).then((data) => updateDetails(title.id, data));
        await Promise.allSettled([ratings, details]);
      }),
    );
  }, [updateRatings, updateDetails]);
  const addedAtById = useMemo(() => new Map(titles.map((title) => [title.id, title.addedAt])), [titles]);
  const addedIds = useMemo(() => new Set(titles.map((title) => title.id)), [titles]);
  const pending = useRef(new Set<string>());
  const [addingIds, setAddingIds] = useState(new Set<string>());

  const addSelection = useCallback(
    async (selection: DiscoverSearchResult) => {
      if (!userId) throw new Error("Sign in to add titles to comparison.");
      const id = titleIdentity(selection);
      if (addedIds.has(id) || pending.current.has(id)) return;
      pending.current.add(id);
      setAddingIds(new Set(pending.current));
      try {
        addTitle(await loadComparisonTitle(selection));
      } finally {
        pending.current.delete(id);
        setAddingIds(new Set(pending.current));
      }
    },
    [userId, addedIds, addTitle],
  );

  return (
    <ComparisonContext.Provider value={{ ...list, enabled: Boolean(userId), refreshTitles, addedIds, addedAtById, addingIds, addSelection }}>{children}</ComparisonContext.Provider>
  );
}

export function useComparison() {
  const comparison = useContext(ComparisonContext);
  if (!comparison) throw new Error("useComparison must be used within ComparisonProvider");
  return comparison;
}
