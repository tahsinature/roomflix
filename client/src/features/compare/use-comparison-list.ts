import { useCallback, useEffect, useState } from "react";
import { arrayMove } from "@dnd-kit/sortable";
import type { ImdbRatings } from "@shared/protocol";
import { comparisonRatings, decodeComparisonList, type ComparisonTitle } from "./comparison-data";

export function useComparisonList(userId: string | null) {
  const storageKey = userId ? `roomflix:compare:v1:${userId}` : null;
  const [storageError, setStorageError] = useState(false);
  const [titles, setTitles] = useState(() => {
    if (!storageKey) return [];
    try {
      return decodeComparisonList(window.localStorage.getItem(storageKey));
    } catch {
      return [];
    }
  });

  useEffect(() => {
    if (!storageKey) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(titles));
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }, [storageKey, titles]);

  const addTitle = useCallback((title: ComparisonTitle) => {
    setTitles((current) => (current.some((item) => item.id === title.id) ? current : [...current, title]));
  }, []);

  const removeTitle = useCallback((id: string) => {
    setTitles((current) => current.filter((title) => title.id !== id));
  }, []);

  const updateRatings = useCallback((id: string, ratings: ImdbRatings) => {
    setTitles((current) =>
      current.map((title) => {
        if (title.id !== id) return title;
        return { ...title, ...comparisonRatings(ratings) };
      }),
    );
  }, []);

  const moveTitle = useCallback((activeId: string, overId: string) => {
    setTitles((current) => {
      const from = current.findIndex((title) => title.id === activeId);
      const to = current.findIndex((title) => title.id === overId);
      return from < 0 || to < 0 || from === to ? current : arrayMove(current, from, to);
    });
  }, []);

  return { titles, addTitle, removeTitle, moveTitle, updateRatings, storageError };
}
