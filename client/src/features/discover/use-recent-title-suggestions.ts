import { useEffect, useState } from "react";
import type { RecentTitleItem } from "@shared/protocol";
import { useAuth } from "@/auth/AuthContext";
import { api } from "@/lib/api";
import { filterAndSortRecentTitles } from "./recent-titles";

export function useRecentTitleSuggestions() {
  const { user } = useAuth();
  const userId = user?.id;
  const [result, setResult] = useState<{ userId?: string; titles: RecentTitleItem[]; loading: boolean; error: string }>({ titles: [], loading: true, error: "" });

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setResult({ userId, titles: [], loading: true, error: "" });
    void api
      .listRecentTitles()
      .then((titles) => {
        if (!cancelled) setResult({ userId, titles: filterAndSortRecentTitles(titles, { query: "", range: "all", sort: "newest" }).slice(0, 8), loading: false, error: "" });
      })
      .catch(() => {
        if (!cancelled) setResult({ userId, titles: [], loading: false, error: "Could not load recently viewed titles. You can still search." });
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return result.userId === userId ? result : { titles: [], loading: Boolean(userId), error: "" };
}
