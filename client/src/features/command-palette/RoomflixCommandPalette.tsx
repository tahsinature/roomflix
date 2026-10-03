import { defaultFilter } from "cmdk";
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Clapperboard, Compass, Database, GitCompareArrows, History, Library, Settings, UserRound, type LucideIcon } from "lucide-react";
import type { DiscoverSearchResponse, DiscoverTitleDetails, TitleLibraryItem, TitleLibraryStatus } from "@shared/protocol";
import { Modal } from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator, CommandShortcut } from "@/components/ui/command";
import { api } from "@/lib/api";
import { discoverPersonPath, posterUrl, titleIdentity, toLibraryPayload } from "@/features/discover/discover-utils";
import { TitleSearchResults } from "./TitleSearchResults";
import { useComparison } from "@/features/compare/ComparisonProvider";
import { CurrentTitleCommands } from "./CurrentTitleCommands";

export default function RoomflixCommandPalette({
  currentTitle,
  addToComparison,
  onClose,
  onLibraryChanged,
}: {
  currentTitle: DiscoverTitleDetails | null;
  addToComparison: boolean;
  onClose: () => void;
  onLibraryChanged: () => void;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { addedIds, addSelection } = useComparison();
  const comparisonActions = location.pathname === "/discover/compare" ? { addedIds, onAdd: addSelection } : null;
  const { error: showError, success: showSuccess } = useToast();
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState<DiscoverSearchResponse | null>(null);
  const [searching, setSearching] = useState(false);
  const [libraryItem, setLibraryItem] = useState<TitleLibraryItem | undefined>();
  const trimmedQuery = query.trim();

  useEffect(() => {
    if (!currentTitle) {
      setLibraryItem(undefined);
      return;
    }
    let cancelled = false;
    void api
      .listTitleLibrary()
      .then((items) => {
        if (!cancelled) setLibraryItem(items.find((item) => titleIdentity(item) === titleIdentity(currentTitle)));
      })
      .catch((error) => {
        if (!cancelled) showError((error as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [currentTitle, showError]);

  useEffect(() => {
    if (trimmedQuery.length < 2) {
      setSearch(null);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearch(null);
    setSearching(true);
    const timer = window.setTimeout(() => {
      void api
        .discoverSearch(trimmedQuery)
        .then((result) => {
          if (!cancelled) setSearch(result);
        })
        .catch((error) => {
          if (!cancelled) showError((error as Error).message);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 280);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [trimmedQuery, showError]);

  const goTo = (path: string) => {
    onClose();
    const opensDiscoverDetail = /^\/discover\/(?:movie|tv|person)\/\d+/.test(path);
    const currentDiscoverState = location.state as { discoverReturnTo?: unknown } | null;
    const discoverReturnTo = /^\/discover(?:\/(recent|watchlist|watched|compare))?$/.test(location.pathname)
      ? location.pathname
      : typeof currentDiscoverState?.discoverReturnTo === "string"
        ? currentDiscoverState.discoverReturnTo
        : "/discover";
    navigate(path, opensDiscoverDetail ? { state: { discoverReturnTo, hasAppReturn: true } } : undefined);
  };
  const saveStatus = async (status: TitleLibraryStatus) => {
    if (!currentTitle) return;
    try {
      const saved = await api.saveTitleLibraryItem(currentTitle.mediaType, currentTitle.tmdbId, toLibraryPayload(currentTitle, status, libraryItem));
      setLibraryItem(saved);
      onLibraryChanged();
      showSuccess(status === "watched" ? `Marked “${currentTitle.title}” as watched.` : `Added “${currentTitle.title}” to your watchlist.`);
    } catch (error) {
      showError((error as Error).message);
    }
  };
  const removeFromLibrary = async () => {
    if (!currentTitle || !libraryItem) return;
    try {
      await api.removeTitleLibraryItem(currentTitle.mediaType, currentTitle.tmdbId);
      setLibraryItem(undefined);
      onLibraryChanged();
      showSuccess(`Removed “${currentTitle.title}” from your library.`);
    } catch (error) {
      showError((error as Error).message);
    }
  };

  const emptyMessage =
    trimmedQuery.length < 2
      ? addToComparison
        ? "Search a movie or series to add one row."
        : "Search a movie, series, person, or command."
      : searching
        ? "Searching Roomflix and TMDB…"
        : addToComparison
          ? "No movies or series found."
          : "No matching commands, titles or people.";

  return (
    <Modal open title={addToComparison && comparisonActions ? "Add to comparison" : "Search Roomflix"} onClose={onClose} className="max-w-2xl" overlayClassName="z-[200]">
      <div className="-m-5">
        <Command loop filter={filterPaletteItem}>
          <CommandInput
            autoFocus
            value={query}
            onValueChange={setQuery}
            placeholder={addToComparison ? "Search a movie or series to add…" : "Search movies, series, people…"}
            aria-label={addToComparison ? "Search movies or series to add to comparison" : "Search movies, series, people, or commands"}
          />
          <CommandList>
            <CommandEmpty>{emptyMessage}</CommandEmpty>

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
            {currentTitle && !addToComparison ? (
              <CurrentTitleCommands details={currentTitle} libraryItem={libraryItem} onClose={onClose} onSaveStatus={saveStatus} onRemove={removeFromLibrary} />
            ) : null}

            {!addToComparison ? (
              <>
                <CommandSeparator />
                <CommandGroup heading="Navigate">
                  <NavigationItem icon={Compass} label="Discover" path="/discover" goTo={goTo} />
                  <NavigationItem icon={Library} label="Watchlist" path="/discover/watchlist" goTo={goTo} />
                  <NavigationItem icon={History} label="Watched" path="/discover/watched" goTo={goTo} />
                  <NavigationItem icon={History} label="Recent titles" path="/discover/recent" goTo={goTo} />
                  <NavigationItem icon={GitCompareArrows} label="Compare titles" path="/discover/compare" goTo={goTo} />
                  <NavigationItem icon={Library} label="Library" path="/library" goTo={goTo} />
                  <NavigationItem icon={History} label="History" path="/history" goTo={goTo} />
                  <NavigationItem icon={Database} label="Storage" path="/storage" goTo={goTo} />
                  <NavigationItem icon={Settings} label="Settings" path="/settings/profile" goTo={goTo} />
                </CommandGroup>
              </>
            ) : null}

            {search?.people.length && !addToComparison ? (
              <>
                <CommandSeparator />
                <CommandGroup heading={search.usedFuzzyFallback ? "Closest people" : "People"}>
                  {search.people.slice(0, 5).map((person) => (
                    <CommandItem key={person.tmdbId} value={`person ${person.name} ${person.knownForDepartment}`} onSelect={() => goTo(discoverPersonPath(person.tmdbId))}>
                      <PaletteImage path={person.profilePath} person />
                      <span className="min-w-0 flex-1 truncate">{person.name}</span>
                      <CommandShortcut>{person.knownForDepartment || "Person"}</CommandShortcut>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            ) : null}
          </CommandList>
          <div className="flex items-center gap-4 border-t border-border px-4 py-2 text-[9px] uppercase tracking-wider text-muted-foreground">
            <span>↑↓ Navigate</span>
            <span>{addToComparison ? "↵ Add title" : "↵ Open"}</span>
            <span className="ml-auto">Esc Close</span>
          </div>
        </Command>
      </div>
    </Modal>
  );
}

function NavigationItem({ icon: Icon, label, path, goTo }: { icon: LucideIcon; label: string; path: string; goTo: (path: string) => void }) {
  return (
    <CommandItem value={`navigate go ${label}`} onSelect={() => goTo(path)}>
      <Icon /> {label}
    </CommandItem>
  );
}

function PaletteImage({ path, person = false }: { path: string | null; person?: boolean }) {
  const image = posterUrl(path, "w185");
  return (
    <span className="grid h-10 w-8 shrink-0 place-items-center overflow-hidden border border-border bg-bg-elevated">
      {image ? <img src={image} alt="" className="h-full w-full object-cover" /> : person ? <UserRound className="text-text-dim" /> : <Clapperboard className="text-text-dim" />}
    </span>
  );
}

// TMDB already ranks title and person matches, including typo corrections.
// Keep those results while cmdk filters local navigation and action commands.
function filterPaletteItem(value: string, search: string, keywords?: string[]) {
  return value.startsWith("title ") || value.startsWith("person ") ? 1 : defaultFilter(value, search, keywords);
}
