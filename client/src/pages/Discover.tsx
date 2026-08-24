import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Bookmark, CheckCircle2, GitCompareArrows, Loader2, Search } from "lucide-react";
import type { DiscoverPersonResult, DiscoverSearchResult, TitleLibraryItem } from "@shared/protocol";
import { useToast } from "@/components/Toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { DiscoverPersonModal } from "@/features/discover/DiscoverPersonModal";
import { DiscoverExplore } from "@/features/discover/DiscoverExplore";
import { DiscoverTitleModal } from "@/features/discover/DiscoverTitleModal";
import { TitleGrid } from "@/features/discover/TitleGrid";
import { WatchlistCompareModal } from "@/features/discover/WatchlistCompareModal";
import { libraryItemToSearchResult, type TitleSelection } from "@/features/discover/discover-utils";
import { EmptyLibrary, LoadingGrid, PersonResult, ViewButton, type DiscoverView } from "@/features/discover/DiscoverPageParts";
import { useCommandPalette } from "@/features/command-palette/CommandPaletteProvider";

export default function Discover() {
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const { libraryRevision } = useCommandPalette();
  const [view, setView] = useState<DiscoverView>("search");
  const [query, setQuery] = useState("");
  const [titles, setTitles] = useState<DiscoverSearchResult[]>([]);
  const [people, setPeople] = useState<DiscoverPersonResult[]>([]);
  const [library, setLibrary] = useState<TitleLibraryItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [usedFuzzyFallback, setUsedFuzzyFallback] = useState(false);
  const [error, setError] = useState("");
  const [selectedTitle, setSelectedTitle] = useState<TitleSelection | null>(null);
  const [selectedPerson, setSelectedPerson] = useState<number | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void api
      .listTitleLibrary()
      .then((items) => {
        if (!cancelled) setLibrary(items);
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Your title library is unavailable.");
      });
    return () => {
      cancelled = true;
    };
  }, [libraryRevision]);

  useEffect(() => {
    const title = searchParams.get("title")?.match(/^(movie|tv):(\d+)$/);
    const person = Number(searchParams.get("person"));
    if (title) {
      setSelectedPerson(null);
      setSelectedTitle({ mediaType: title[1] as TitleSelection["mediaType"], tmdbId: Number(title[2]) });
    } else if (Number.isInteger(person) && person > 0) {
      setSelectedTitle(null);
      setSelectedPerson(person);
    } else {
      setSelectedTitle(null);
      setSelectedPerson(null);
    }
  }, [searchParams]);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setTitles([]);
      setPeople([]);
      setSearching(false);
      setUsedFuzzyFallback(false);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSearching(true);
      setError("");
      setUsedFuzzyFallback(false);
      void api
        .discoverSearch(trimmed)
        .then((result) => {
          if (controller.signal.aborted) return;
          setTitles(result.titles);
          setPeople(result.people);
          setUsedFuzzyFallback(result.usedFuzzyFallback);
        })
        .catch((reason) => {
          if (!controller.signal.aborted) setError((reason as Error).message);
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearching(false);
        });
    }, 320);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query]);

  const shortlist = useMemo(() => library.filter((item) => item.status === "shortlist"), [library]);
  const watched = useMemo(() => library.filter((item) => item.status === "watched"), [library]);
  const libraryTitles = view === "shortlist" ? shortlist : watched;

  const saveItem: React.ComponentProps<typeof DiscoverTitleModal>["onSave"] = async (item) => {
    try {
      const saved = await api.saveTitleLibraryItem(item.mediaType, item.tmdbId, item);
      setLibrary((current) => [saved, ...current.filter((candidate) => candidate.id !== saved.id)]);
      toast.success(saved.status === "watched" ? `Marked “${saved.title}” as watched.` : `Added “${saved.title}” to your watchlist.`);
    } catch (reason) {
      toast.error((reason as Error).message);
      throw reason;
    }
  };

  const removeItem: React.ComponentProps<typeof DiscoverTitleModal>["onRemove"] = async (mediaType, tmdbId) => {
    try {
      await api.removeTitleLibraryItem(mediaType, tmdbId);
      setLibrary((current) => current.filter((item) => !(item.mediaType === mediaType && item.tmdbId === tmdbId)));
      toast.success("Removed from your title library.");
    } catch (reason) {
      toast.error((reason as Error).message);
      throw reason;
    }
  };

  const openPerson = (tmdbId: number) => {
    setSelectedTitle(null);
    setSelectedPerson(tmdbId);
    setSearchParams({ person: String(tmdbId) });
  };
  const openTitle = (selection: TitleSelection) => {
    setSelectedPerson(null);
    setSelectedTitle(selection);
    setSearchParams({ title: `${selection.mediaType}:${selection.tmdbId}` });
  };

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-7 px-4 py-6 sm:px-6 sm:py-8">
      <div className="grid grid-cols-3 border border-border bg-card/35">
        <ViewButton active={view === "search"} onClick={() => setView("search")} icon={Search}>
          Search
        </ViewButton>
        <ViewButton active={view === "shortlist"} onClick={() => setView("shortlist")} icon={Bookmark}>
          Watchlist · {shortlist.length}
        </ViewButton>
        <ViewButton active={view === "watched"} onClick={() => setView("watched")} icon={CheckCircle2}>
          Watched · {watched.length}
        </ViewButton>
      </div>

      {view === "search" ? (
        <section>
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search a movie, series, actor, director or producer…"
              className="h-16 pl-12 pr-12 text-base sm:text-lg"
              autoFocus
            />
            {searching ? <Loader2 className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-accent" /> : null}
          </div>
          {error ? <div className="mt-4 border border-accent/30 bg-accent/10 p-3 text-xs text-accent">{error}</div> : null}
          {usedFuzzyFallback && !searching ? (
            <div className="mt-4 border border-cyan/30 bg-cyan/5 px-3 py-2 text-[10px] text-cyan">Showing typo-tolerant matches alongside TMDB results.</div>
          ) : null}
          {query.trim().length >= 2 && !searching && !error && titles.length === 0 && people.length === 0 ? (
            <div className="mt-6 border border-border p-8 text-center text-xs text-muted-foreground">No supported people or titles found.</div>
          ) : null}

          {people.length > 0 ? (
            <section className="mt-7">
              <h2 className="section-label">People</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {people.map((person) => (
                  <PersonResult key={person.tmdbId} person={person} onSelect={() => openPerson(person.tmdbId)} onSelectTitle={openTitle} />
                ))}
              </div>
            </section>
          ) : null}

          {query.trim().length >= 2 ? (
            <section className="mt-7">
              <div className="flex items-center justify-between gap-3">
                <h2 className="section-label">Titles</h2>
                <span className="text-[9px] uppercase tracking-[0.13em] text-text-dim">{titles.length} results</span>
              </div>
              <div className="mt-3">{searching && !titles.length ? <LoadingGrid /> : <TitleGrid titles={titles} library={library} onSelect={openTitle} />}</div>
            </section>
          ) : (
            <div className="mt-7">
              <DiscoverExplore library={library} onSelect={openTitle} />
            </div>
          )}
        </section>
      ) : (
        <section>
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="section-label">{view === "shortlist" ? "My watchlist" : "My watched log"}</h2>
              <p className="mt-2 text-xs text-muted-foreground">Personal to your Roomflix account.</p>
            </div>
            <div className="flex items-center gap-3">
              {view === "shortlist" && shortlist.length >= 2 ? (
                <Button type="button" variant="outline" size="sm" onClick={() => setCompareOpen(true)}>
                  <GitCompareArrows className="h-3.5 w-3.5" /> Compare
                </Button>
              ) : null}
              <span className="text-[10px] text-text-dim">{libraryTitles.length} titles</span>
            </div>
          </div>
          <div className="mt-4">
            {libraryTitles.length ? (
              <TitleGrid titles={libraryTitles.map(libraryItemToSearchResult)} library={library} onSelect={openTitle} />
            ) : (
              <EmptyLibrary view={view} onSearch={() => setView("search")} />
            )}
          </div>
        </section>
      )}

      <DiscoverTitleModal
        selection={selectedTitle}
        library={library}
        onClose={() => setSearchParams({})}
        onSelectTitle={openTitle}
        onSelectPerson={openPerson}
        onSave={saveItem}
        onRemove={removeItem}
      />
      <DiscoverPersonModal tmdbId={selectedPerson} library={library} onClose={() => setSearchParams({})} onSelectTitle={openTitle} />
      <WatchlistCompareModal open={compareOpen} items={shortlist} onClose={() => setCompareOpen(false)} />
    </main>
  );
}
