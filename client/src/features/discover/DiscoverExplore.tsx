import { useEffect, useState } from "react";
import { Clapperboard, Flame, Loader2, Tv } from "lucide-react";
import type { DiscoverGenre, DiscoverMediaType, DiscoverSearchResult, TitleLibraryItem } from "@shared/protocol";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { TitleGrid } from "./TitleGrid";
import type { TitleSelection } from "./discover-utils";
import { useHistoryEntryState } from "@/navigation/history-entry-memory";

type ExploreMode = "trending" | DiscoverMediaType;

const MODES = [
  { value: "trending" as const, label: "Trending", icon: Flame },
  { value: "movie" as const, label: "Films", icon: Clapperboard },
  { value: "tv" as const, label: "Series", icon: Tv },
];

const VOTE_FILTERS = [
  { value: 0, label: "Any audience" },
  { value: 100, label: "100+ votes" },
  { value: 1_000, label: "1k+ votes" },
  { value: 10_000, label: "10k+ votes" },
];

export function DiscoverExplore({ library, onSelect }: { library: TitleLibraryItem[]; onSelect: (selection: TitleSelection) => void }) {
  const [mode, setMode] = useHistoryEntryState<ExploreMode>("discover.explore.mode", "trending");
  const [genres, setGenres] = useState<DiscoverGenre[]>([]);
  const [selectedGenreByType, setSelectedGenreByType] = useHistoryEntryState<Partial<Record<DiscoverMediaType, number>>>("discover.explore.genres", {});
  const [minimumVotes, setMinimumVotes] = useHistoryEntryState("discover.explore.minimum-votes", 0);
  const [titles, setTitles] = useState<DiscoverSearchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const selectedGenreId = mode === "trending" ? undefined : selectedGenreByType[mode];

  useEffect(() => {
    if (mode === "trending") {
      setGenres([]);
      return;
    }
    let cancelled = false;
    setError("");
    void api
      .discoverGenres(mode)
      .then((items) => {
        if (cancelled) return;
        setGenres(items);
        setSelectedGenreByType((current) => (current[mode] || !items[0] ? current : { ...current, [mode]: items[0].id }));
      })
      .catch((reason) => {
        if (!cancelled) setError((reason as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [mode]);

  useEffect(() => {
    if (mode !== "trending" && !selectedGenreId) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    const request = mode === "trending" ? api.discoverTrending() : api.discoverByGenre(mode, selectedGenreId!, minimumVotes);
    void request
      .then((items) => {
        if (!cancelled) setTitles(mode === "trending" && minimumVotes ? items.filter((item) => item.voteCount >= minimumVotes) : items);
      })
      .catch((reason) => {
        if (!cancelled) setError((reason as Error).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mode, selectedGenreId, minimumVotes]);

  return (
    <section>
      <div className="flex flex-col gap-3 border border-border bg-card/35 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap border border-border">
          {MODES.map((option) => {
            const Icon = option.icon;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={mode === option.value}
                onClick={() => setMode(option.value)}
                className={cn(
                  "inline-flex items-center gap-1.5 border-r border-border px-3 py-2 text-[10px] uppercase tracking-[0.11em] transition last:border-r-0",
                  mode === option.value ? "bg-accent/10 text-accent" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5" /> {option.label}
              </button>
            );
          })}
        </div>
        <label className="flex items-center gap-2 text-[9px] uppercase tracking-[0.13em] text-muted-foreground">
          Audience signal
          <select
            value={minimumVotes}
            onChange={(event) => setMinimumVotes(Number(event.target.value))}
            className="h-8 border border-border bg-input px-2 text-[10px] normal-case tracking-normal text-foreground"
          >
            {VOTE_FILTERS.map((filter) => (
              <option key={filter.value} value={filter.value}>
                {filter.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {mode !== "trending" && genres.length ? (
        <div className="mt-3 flex flex-wrap gap-2" aria-label={`${mode} genres`}>
          {genres.map((genre) => (
            <button
              key={genre.id}
              type="button"
              aria-pressed={selectedGenreId === genre.id}
              onClick={() => setSelectedGenreByType((current) => ({ ...current, [mode]: genre.id }))}
              className={cn(
                "border px-2.5 py-1 text-[10px] uppercase tracking-[0.1em] transition",
                selectedGenreId === genre.id ? "border-cyan/45 bg-cyan/10 text-cyan" : "border-border text-muted-foreground hover:border-border-hover hover:text-foreground",
              )}
            >
              {genre.name}
            </button>
          ))}
        </div>
      ) : null}

      {error ? <div className="mt-4 border border-accent/30 bg-accent/10 p-3 text-xs text-accent">{error}</div> : null}
      <div className="mt-4">
        {loading ? (
          <div className="grid min-h-48 place-items-center text-accent">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : titles.length ? (
          <TitleGrid titles={titles} library={library} onSelect={onSelect} />
        ) : (
          <p className="border border-border p-8 text-center text-xs text-muted-foreground">No titles match this combination yet.</p>
        )}
      </div>
    </section>
  );
}
