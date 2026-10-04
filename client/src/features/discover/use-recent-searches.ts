import { useEffect, useState } from "react";
import { useAuth } from "@/auth/AuthContext";
import { addRecentSearch, decodeRecentSearches } from "./recent-searches";

function readSearches(key: string | null): string[] | null {
  if (!key) return [];
  try {
    return decodeRecentSearches(localStorage.getItem(key));
  } catch {
    return null;
  }
}

export function useRecentSearches() {
  const { user } = useAuth();
  const key = user ? `roomflix:recent-searches:v1:${user.id}` : null;
  const [saved, setSaved] = useState(() => ({ key, terms: readSearches(key) ?? [] }));
  const terms = saved.key === key ? saved.terms : [];

  useEffect(() => {
    setSaved({ key, terms: readSearches(key) ?? [] });
    const refresh = () => setSaved({ key, terms: readSearches(key) ?? [] });
    window.addEventListener("storage", refresh);
    window.addEventListener("roomflix:recent-searches-changed", refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("roomflix:recent-searches-changed", refresh);
    };
  }, [key]);

  const update = (change: (current: string[]) => string[]) => {
    if (!key) return;
    const next = change(readSearches(key) ?? terms);
    setSaved({ key, terms: next });
    try {
      localStorage.setItem(key, JSON.stringify(next));
      window.dispatchEvent(new Event("roomflix:recent-searches-changed"));
    } catch {
      /* Keep the current session usable when browser storage is blocked. */
    }
  };

  return {
    terms,
    rememberSearch: (query: string) => update((current) => addRecentSearch(current, query)),
    removeSearch: (query: string) => update((current) => current.filter((term) => term !== query)),
    clearSearches: () => update(() => []),
  };
}
