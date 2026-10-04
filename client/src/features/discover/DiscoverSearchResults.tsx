import { useEffect, useState } from "react";
import { Loader2, Search } from "lucide-react";
import type { DiscoverSearchResult, TitleLibraryItem } from "@shared/protocol";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { TitleGrid } from "./TitleGrid";
import type { TitleSelection } from "./discover-utils";

export function DiscoverSearchResults({
  query,
  library,
  onSelect,
  onSearch,
}: {
  query: string;
  library: TitleLibraryItem[];
  onSelect: (title: TitleSelection) => void;
  onSearch: (query: string) => void;
}) {
  const [draft, setDraft] = useState(query);
  const [titles, setTitles] = useState<DiscoverSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fuzzy, setFuzzy] = useState(false);

  useEffect(() => {
    setDraft(query);
    setTitles([]);
    setError("");
    setFuzzy(false);
    setLoading(query.length >= 2);
    if (query.length < 2) return;
    let cancelled = false;
    void api
      .discoverSearch(query)
      .then((result) => {
        if (!cancelled) {
          setTitles(result.titles);
          setFuzzy(result.usedFuzzyFallback);
        }
      })
      .catch(() => {
        if (!cancelled) setError("Could not load search results. Please try again.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [query]);

  return (
    <section>
      <form
        className="flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (draft.trim().length >= 2) {
            onSearch(draft.trim());
          }
        }}
      >
        <Input
          aria-label="Search movies and series"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Search movies and series…"
          className="min-w-0 flex-1"
        />
        <Button type="submit" disabled={draft.trim().length < 2}>
          <Search className="size-4" /> Search
        </Button>
      </form>
      <div className="my-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-sm font-semibold">{query ? `Results for “${query}”` : "Search titles"}</h1>
        {!loading && query.length >= 2 && !error ? (
          <span className="text-[10px] text-muted-foreground">
            {titles.length} titles{fuzzy ? " · Closest matches" : ""}
          </span>
        ) : null}
      </div>
      {loading ? (
        <div className="grid min-h-48 place-items-center" role="status" aria-label="Loading search results">
          <Loader2 className="size-5 animate-spin text-accent" />
        </div>
      ) : error ? (
        <p role="alert" className="border border-accent/30 p-4 text-xs text-accent">
          {error}
        </p>
      ) : titles.length ? (
        <TitleGrid titles={titles} library={library} onSelect={onSelect} />
      ) : (
        <p className="border border-border p-8 text-center text-xs text-muted-foreground">
          {query.length < 2 ? "Enter at least two characters to search." : "No movies or series found. Try another title."}
        </p>
      )}
    </section>
  );
}
