import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import type { DiscoverSearchResult } from "@shared/protocol";
import { useAuth } from "@/auth/AuthContext";
import { titleIdentity } from "@/features/discover/discover-utils";
import { loadComparisonTitle } from "./comparison-data";
import { useComparisonList } from "./use-comparison-list";

type ComparisonContextValue = ReturnType<typeof useComparisonList> & {
  enabled: boolean;
  addedIds: Set<string>;
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
  const { titles, addTitle } = list;
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

  return <ComparisonContext.Provider value={{ ...list, enabled: Boolean(userId), addedIds, addingIds, addSelection }}>{children}</ComparisonContext.Provider>;
}

export function useComparison() {
  const comparison = useContext(ComparisonContext);
  if (!comparison) throw new Error("useComparison must be used within ComparisonProvider");
  return comparison;
}
