import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Bookmark, CheckCircle2, Clock3, GitCompareArrows, Loader2, Search, X } from "lucide-react";
import type { DiscoverImageKind, DiscoverPersonResult, DiscoverSearchResult, RecentTitleItem, TitleLibraryItem } from "@shared/protocol";
import { useToast } from "@/components/Toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { DiscoverExplore } from "@/features/discover/DiscoverExplore";
import { DiscoverPersonView } from "@/features/discover/DiscoverPersonView";
import { DiscoverPhotoGallery } from "@/features/discover/DiscoverPhotoGallery";
import { DiscoverTitleView } from "@/features/discover/DiscoverTitleView";
import { DiscoverEpisodeView } from "@/features/discover/DiscoverEpisodeView";
import { RecentTitlesView } from "@/features/discover/RecentTitlesView";
import { TitleGrid } from "@/features/discover/TitleGrid";
import { WatchlistCompareModal } from "@/features/discover/WatchlistCompareModal";
import {
  discoverPersonPath,
  discoverPersonPhotosPath,
  discoverEpisodePath,
  discoverTitlePath,
  discoverTitlePhotosPath,
  libraryItemToSearchResult,
  parseDiscoverPersonRoute,
  parseDiscoverEpisodeRoute,
  parseDiscoverTitleRoute,
  parseLegacyPersonParam,
  parseLegacyTitleParam,
  type EpisodeSelection,
  type TitleSelection,
} from "@/features/discover/discover-utils";
import { EmptyLibrary, LoadingGrid, PersonResult, ViewButton, type DiscoverView } from "@/features/discover/DiscoverPageParts";
import { useCommandPalette } from "@/features/command-palette/CommandPaletteProvider";
import { mergeRecordedRecentTitle } from "@/features/discover/recent-titles";
import { useHistoryEntryState } from "@/navigation/history-entry-memory";
import { useAppBack, type AppReturnState } from "@/navigation/use-app-back";

type DiscoverRouteState = AppReturnState & {
  discoverReturnTo?: unknown;
  galleryKind?: unknown;
};

export default function Discover() {
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const { entityType, tmdbId, subview, seasonNumber, episodeNumber } = useParams<{
    entityType?: string;
    tmdbId?: string;
    subview?: string;
    seasonNumber?: string;
    episodeNumber?: string;
  }>();
  const [searchParams] = useSearchParams();
  const { libraryRevision } = useCommandPalette();
  const [rootView, setRootView] = useHistoryEntryState<Exclude<DiscoverView, "recent">>("discover.root-view", "search");
  const [query, setQuery] = useHistoryEntryState("discover.search-query", "");
  const [titles, setTitles] = useState<DiscoverSearchResult[]>([]);
  const [people, setPeople] = useState<DiscoverPersonResult[]>([]);
  const [library, setLibrary] = useState<TitleLibraryItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [usedFuzzyFallback, setUsedFuzzyFallback] = useState(false);
  const [error, setError] = useState("");
  const [compareOpen, setCompareOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [recentTitles, setRecentTitles] = useState<RecentTitleItem[]>([]);
  const [recentLoading, setRecentLoading] = useState(true);
  const [recentError, setRecentError] = useState("");
  const recentClearRevision = useRef(0);
  const recentLoadRevision = useRef(0);
  const recentLoaded = useRef(false);
  const selectedTitle = useMemo(() => parseDiscoverTitleRoute(entityType, tmdbId), [entityType, tmdbId]);
  const selectedEpisode = useMemo(() => parseDiscoverEpisodeRoute(entityType, tmdbId, seasonNumber, episodeNumber), [entityType, episodeNumber, seasonNumber, tmdbId]);
  const selectedPersonId = useMemo(() => parseDiscoverPersonRoute(entityType, tmdbId), [entityType, tmdbId]);
  const isPhotoRoute = subview === "photos" && Boolean(selectedTitle || selectedPersonId);
  const isEpisodePath = seasonNumber !== undefined || episodeNumber !== undefined;
  const legacyTitle = parseLegacyTitleParam(searchParams.get("title"));
  const legacyPersonId = parseLegacyPersonParam(searchParams.get("person"));
  const isRecentRoute = entityType === "recent" && !tmdbId;
  const wasRecentRoute = useRef(isRecentRoute);
  const view: DiscoverView = isRecentRoute ? "recent" : rootView;
  const routeState = location.state as DiscoverRouteState | null;
  const discoverReturnTo = isRecentRoute || routeState?.discoverReturnTo === "/discover/recent" ? "/discover/recent" : "/discover";
  const defaultGalleryReturnTo = selectedTitle ? discoverTitlePath(selectedTitle) : selectedPersonId ? discoverPersonPath(selectedPersonId) : "/discover";
  const galleryKind = isDiscoverImageKind(routeState?.galleryKind) ? routeState.galleryKind : undefined;
  const episodeSeriesPath = selectedEpisode ? discoverTitlePath({ mediaType: "tv", tmdbId: selectedEpisode.seriesTmdbId }) : null;
  const goBack = useAppBack(episodeSeriesPath ?? (isPhotoRoute ? defaultGalleryReturnTo : discoverReturnTo));

  const loadRecentHistory = useCallback(() => {
    const loadRevision = ++recentLoadRevision.current;
    const clearRevision = recentClearRevision.current;
    setRecentLoading(true);
    setRecentError("");
    void api
      .listRecentTitles()
      .then((items) => {
        if (loadRevision === recentLoadRevision.current && clearRevision === recentClearRevision.current) {
          setRecentTitles(items);
          recentLoaded.current = true;
        }
      })
      .catch((reason) => {
        if (loadRevision === recentLoadRevision.current && clearRevision === recentClearRevision.current) {
          setRecentError(reason instanceof Error ? reason.message : "Recent history is unavailable.");
        }
      })
      .finally(() => {
        if (loadRevision === recentLoadRevision.current) setRecentLoading(false);
      });
  }, []);

  useEffect(() => {
    loadRecentHistory();
  }, [loadRecentHistory]);

  useEffect(() => {
    if (isRecentRoute && !wasRecentRoute.current) loadRecentHistory();
    wasRecentRoute.current = isRecentRoute;
  }, [isRecentRoute, loadRecentHistory]);

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
  const libraryTitles = view === "shortlist" ? shortlist : view === "watched" ? watched : [];

  const rememberTitle = useCallback(
    (title: DiscoverSearchResult) => {
      const clearRevision = recentClearRevision.current;
      void api
        .recordRecentTitle(title)
        .then((recorded) => {
          if (clearRevision === recentClearRevision.current) {
            setRecentTitles((current) => mergeRecordedRecentTitle(current, recorded));
            setRecentError("");
            if (!recentLoaded.current) loadRecentHistory();
          }
        })
        .catch(() => {
          if (clearRevision === recentClearRevision.current) setRecentError("A recent title could not be synced to your account.");
        });
    },
    [loadRecentHistory],
  );

  const saveItem: React.ComponentProps<typeof DiscoverTitleView>["onSave"] = async (item) => {
    try {
      const saved = await api.saveTitleLibraryItem(item.mediaType, item.tmdbId, item);
      setLibrary((current) => [saved, ...current.filter((candidate) => candidate.id !== saved.id)]);
      toast.success(saved.status === "watched" ? `Marked “${saved.title}” as watched.` : `Added “${saved.title}” to your watchlist.`);
    } catch (reason) {
      toast.error((reason as Error).message);
      throw reason;
    }
  };

  const removeItem: React.ComponentProps<typeof DiscoverTitleView>["onRemove"] = async (mediaType, tmdbId) => {
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
    navigate(discoverPersonPath(tmdbId), { state: { discoverReturnTo, hasAppReturn: true } satisfies DiscoverRouteState });
  };
  const openTitle = (selection: TitleSelection) => {
    navigate(discoverTitlePath(selection), { state: { discoverReturnTo, hasAppReturn: true } satisfies DiscoverRouteState });
  };
  const openEpisode = (selection: EpisodeSelection) => {
    navigate(discoverEpisodePath(selection), { state: { discoverReturnTo, hasAppReturn: true } satisfies DiscoverRouteState });
  };
  const openPersonPhotos = (personTmdbId: number) => {
    navigate(discoverPersonPhotosPath(personTmdbId), {
      state: { discoverReturnTo, galleryKind: "profile" satisfies DiscoverImageKind, hasAppReturn: true } satisfies DiscoverRouteState,
    });
  };
  const openTitlePhotos = (selection: TitleSelection, kind: DiscoverImageKind) => {
    navigate(discoverTitlePhotosPath(selection), {
      state: { discoverReturnTo, galleryKind: kind, hasAppReturn: true } satisfies DiscoverRouteState,
    });
  };

  const selectView = (nextView: DiscoverView) => {
    setMobileSearchOpen(nextView === "search");
    if (nextView === "recent") {
      navigate("/discover/recent");
      return;
    }
    setRootView(nextView);
    if (isRecentRoute) navigate("/discover");
  };

  const closeMobileSearch = () => {
    setQuery("");
    setMobileSearchOpen(false);
  };

  const clearHistory = async () => {
    if (recentTitles.length === 0) return;
    recentClearRevision.current += 1;
    try {
      await api.clearRecentTitles();
      setRecentTitles([]);
      recentLoaded.current = true;
      setRecentError("");
      toast.success("Recently viewed history cleared.");
    } catch (reason) {
      toast.error((reason as Error).message);
      loadRecentHistory();
      throw reason;
    }
  };

  if (!selectedTitle && !selectedPersonId && legacyTitle) return <Navigate to={discoverTitlePath(legacyTitle)} replace />;
  if (!selectedTitle && !selectedPersonId && legacyPersonId) return <Navigate to={discoverPersonPath(legacyPersonId)} replace />;
  if (isEpisodePath && !selectedEpisode) return <Navigate to={selectedTitle ? discoverTitlePath(selectedTitle) : "/discover"} replace />;
  if (subview && subview !== "photos") return <Navigate to={defaultGalleryReturnTo} replace />;
  if ((entityType || tmdbId) && !selectedTitle && !selectedPersonId && !isRecentRoute) return <Navigate to="/discover" replace />;

  if (isPhotoRoute && selectedTitle) {
    return <DiscoverPhotoGallery subject={{ type: selectedTitle.mediaType, tmdbId: selectedTitle.tmdbId }} initialKind={galleryKind} onBack={goBack} />;
  }

  if (isPhotoRoute && selectedPersonId) {
    return <DiscoverPhotoGallery subject={{ type: "person", tmdbId: selectedPersonId }} initialKind="profile" onBack={goBack} />;
  }

  if (selectedEpisode) {
    return (
      <DiscoverEpisodeView
        selection={selectedEpisode}
        onBack={goBack}
        onOpenSeries={() => openTitle({ mediaType: "tv", tmdbId: selectedEpisode.seriesTmdbId })}
        onSelectPerson={openPerson}
      />
    );
  }

  if (selectedTitle) {
    return (
      <DiscoverTitleView
        selection={selectedTitle}
        library={library}
        onBack={goBack}
        onSelectTitle={openTitle}
        onSelectPerson={openPerson}
        onOpenGallery={(kind) => openTitlePhotos(selectedTitle, kind)}
        onSelectEpisode={openEpisode}
        onViewed={rememberTitle}
        onSave={saveItem}
        onRemove={removeItem}
      />
    );
  }

  if (selectedPersonId) {
    return (
      <DiscoverPersonView
        key={selectedPersonId}
        tmdbId={selectedPersonId}
        library={library}
        onBack={goBack}
        onSelectTitle={openTitle}
        onOpenGallery={() => openPersonPhotos(selectedPersonId)}
      />
    );
  }

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-7 px-4 py-6 sm:px-6 sm:py-8">
      <div
        className={view === "search" && mobileSearchOpen ? "grid grid-cols-1 border border-border bg-card/35 sm:grid-cols-4" : "grid grid-cols-4 border border-border bg-card/35"}
      >
        {view === "search" ? (
          <>
            <DiscoverSearchField className="hidden sm:block" query={query} searching={searching} onQueryChange={setQuery} />
            {mobileSearchOpen ? (
              <DiscoverSearchField className="sm:hidden" query={query} searching={searching} onQueryChange={setQuery} onClose={closeMobileSearch} />
            ) : (
              <div className="contents sm:hidden">
                <ViewButton active onClick={() => selectView("search")} icon={Search}>
                  Search
                </ViewButton>
              </div>
            )}
          </>
        ) : (
          <ViewButton active={false} onClick={() => selectView("search")} icon={Search}>
            Search
          </ViewButton>
        )}
        <div className={view === "search" && mobileSearchOpen ? "hidden sm:contents" : "contents"}>
          <ViewButton active={view === "shortlist"} onClick={() => selectView("shortlist")} icon={Bookmark} count={shortlist.length}>
            Watchlist
          </ViewButton>
          <ViewButton active={view === "watched"} onClick={() => selectView("watched")} icon={CheckCircle2} count={watched.length}>
            Watched
          </ViewButton>
          <ViewButton active={view === "recent"} onClick={() => selectView("recent")} icon={Clock3} count={recentTitles.length}>
            Recent
          </ViewButton>
        </div>
      </div>

      {view === "search" ? (
        <section>
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
                  <PersonResult
                    key={person.tmdbId}
                    person={person}
                    onSelect={() => openPerson(person.tmdbId)}
                    onSelectPhotos={() => openPersonPhotos(person.tmdbId)}
                    onSelectTitle={openTitle}
                  />
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
            <div>
              <DiscoverExplore library={library} onSelect={openTitle} />
            </div>
          )}
        </section>
      ) : view === "recent" ? (
        <RecentTitlesView
          titles={recentTitles}
          library={library}
          onSelect={openTitle}
          onClear={clearHistory}
          onSearch={() => selectView("search")}
          loading={recentLoading}
          error={recentError}
          onRetry={loadRecentHistory}
        />
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
              <EmptyLibrary view={view} onSearch={() => selectView("search")} />
            )}
          </div>
        </section>
      )}

      <WatchlistCompareModal open={compareOpen} items={shortlist} onClose={() => setCompareOpen(false)} />
    </main>
  );
}

function DiscoverSearchField({
  query,
  searching,
  onQueryChange,
  onClose,
  className = "",
}: {
  query: string;
  searching: boolean;
  onQueryChange: (query: string) => void;
  onClose?: () => void;
  className?: string;
}) {
  const showAction = Boolean(onClose || query);
  return (
    <div className={`relative min-w-0 border-r border-border bg-accent/[0.06] ${className}`}>
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-accent" aria-hidden="true" />
      <Input
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        placeholder="Search movies or people…"
        aria-label="Search movies, series, or people"
        autoFocus={Boolean(onClose)}
        className={`h-full min-h-11 border-0 bg-transparent pl-10 text-xs focus-visible:border-0 focus-visible:bg-accent/[0.04] ${showAction ? "pr-16" : "pr-3"}`}
      />
      {searching ? <Loader2 className={`absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-accent ${showAction ? "right-10" : "right-3.5"}`} /> : null}
      {showAction ? (
        <button
          type="button"
          onClick={() => {
            onQueryChange("");
            onClose?.();
          }}
          aria-label={onClose ? "Close search" : "Clear search"}
          className="absolute right-1.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/60"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}

function isDiscoverImageKind(value: unknown): value is DiscoverImageKind {
  return value === "profile" || value === "backdrop" || value === "poster";
}
