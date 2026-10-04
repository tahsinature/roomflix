import { useEffect, useMemo, useState } from "react";
import type { TitleLibraryItem } from "@shared/protocol";
import { useAuth } from "@/auth/AuthContext";
import { api } from "@/lib/api";
import { useCommandPalette } from "@/features/command-palette/CommandPaletteProvider";
import { titleIdentity } from "./discover-utils";

export function useTitleLibraryStatuses() {
  const { user } = useAuth();
  const userId = user?.id;
  const { libraryRevision } = useCommandPalette();
  const [library, setLibrary] = useState<{ userId?: string; items: TitleLibraryItem[] }>({ items: [] });
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void api
      .listTitleLibrary()
      .then((items) => {
        if (!cancelled) setLibrary({ userId, items });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [userId, libraryRevision]);
  return useMemo(() => new Map((library.userId === userId ? library.items : []).map((item) => [titleIdentity(item), item])), [library, userId]);
}
