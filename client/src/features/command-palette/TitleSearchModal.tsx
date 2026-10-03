import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { DiscoverSearchResponse } from "@shared/protocol";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/Modal";
import { Command, CommandEmpty, CommandInput, CommandList } from "@/components/ui/command";
import { api } from "@/lib/api";
import { useComparison } from "@/features/compare/ComparisonProvider";
import { TitleSearchResults } from "./TitleSearchResults";

export default function TitleSearchModal({ addToComparison, onClose }: { addToComparison: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { addedIds, addSelection } = useComparison();
  const comparisonActions = addToComparison || location.pathname === "/discover/compare" ? { addedIds, onAdd: addSelection } : null;
  const [selectedExplicitly, setSelectedExplicitly] = useState(false);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState<DiscoverSearchResponse | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmedQuery = query.trim();

  useEffect(() => {
    setSearch(null);
    setError(null);
    setSearching(trimmedQuery.length >= 2);
    if (trimmedQuery.length < 2) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void api
        .discoverSearch(trimmedQuery)
        .then((result) => {
          if (!cancelled) setSearch(result);
        })
        .catch(() => {
          if (!cancelled) setError("Could not search titles. Please try again.");
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 280);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [trimmedQuery]);

  const submitSearch = () => {
    if (trimmedQuery.length < 2) return;
    onClose();
    navigate(`/discover/search?${new URLSearchParams({ q: trimmedQuery })}`);
  };
  const goTo = (path: string) => {
    const previousState = location.state as { discoverReturnTo?: unknown } | null;
    const discoverReturnTo = /^\/discover(?:\/(recent|watchlist|watched|compare)|\/search)?$/.test(location.pathname)
      ? location.pathname + location.search
      : typeof previousState?.discoverReturnTo === "string"
        ? previousState.discoverReturnTo
        : "/discover";
    onClose();
    navigate(path, { state: { discoverReturnTo, hasAppReturn: true } });
  };
  const message = error ?? (trimmedQuery.length < 2 ? "Search a movie or series by title." : searching ? "Searching movies and series…" : "No movies or series found.");

  return (
    <Modal open title={addToComparison ? "Add to comparison" : "Search titles"} onClose={onClose} className="max-w-2xl" overlayClassName="z-[200]">
      <div className="-m-5">
        <Command
          loop
          shouldFilter={false}
          className={
            !addToComparison && !selectedExplicitly ? "[&_[cmdk-item][data-selected=true]]:!bg-transparent [&_[cmdk-item][data-selected=true]]:!text-foreground" : undefined
          }
          onKeyDown={(event) => {
            if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key) && search?.titles.length) {
              if (!selectedExplicitly && (event.key === "ArrowDown" || event.key === "ArrowUp")) event.preventDefault();
              setSelectedExplicitly(true);
            }
            if (event.key === "Enter" && !event.nativeEvent.isComposing && !addToComparison && !selectedExplicitly) {
              event.preventDefault();
              submitSearch();
            }
          }}
        >
          <CommandInput
            autoFocus
            value={query}
            onValueChange={(value) => {
              setQuery(value);
              setSelectedExplicitly(false);
            }}
            placeholder={addToComparison ? "Search a movie or series to add…" : "Search movies and series…"}
            aria-label="Search movies and series"
            trailingContent={
              !addToComparison ? (
                <Button type="button" size="sm" disabled={trimmedQuery.length < 2} onClick={submitSearch} onKeyDown={(event) => event.stopPropagation()} className="shrink-0">
                  Search
                </Button>
              ) : null
            }
          />
          <CommandList
            onPointerMove={(event) => {
              if (event.target instanceof Element && event.target.closest("[cmdk-item]")) setSelectedExplicitly(true);
            }}
          >
            <CommandEmpty>{message}</CommandEmpty>
            {search?.titles.length ? (
              <TitleSearchResults
                titles={search.titles}
                fuzzy={search.usedFuzzyFallback}
                comparisonActions={comparisonActions}
                addToComparison={addToComparison}
                goTo={goTo}
                onClose={onClose}
              />
            ) : null}
          </CommandList>
          <div className="flex items-center gap-4 border-t border-border px-4 py-2 text-[9px] uppercase tracking-wider text-muted-foreground">
            <span>↑↓ Navigate</span>
            <span>{addToComparison ? "↵ Add title" : selectedExplicitly ? "↵ Open title" : "↵ Search all"}</span>
            <span className="ml-auto">Esc Close</span>
          </div>
        </Command>
      </div>
    </Modal>
  );
}
