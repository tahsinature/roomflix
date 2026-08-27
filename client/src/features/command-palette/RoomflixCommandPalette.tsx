import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Clapperboard, Compass, Database, History, Home, Library, Settings, UserRound } from "lucide-react";
import type { DiscoverSearchResponse, DiscoverTitleDetails, TitleLibraryItem, TitleLibraryStatus } from "@shared/protocol";
import { Modal } from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator, CommandShortcut } from "@/components/ui/command";
import { api } from "@/lib/api";
import { discoverPersonPath, discoverTitlePath, posterUrl, titleIdentity, toLibraryPayload } from "@/features/discover/discover-utils";
import { CurrentTitleCommands } from "./CurrentTitleCommands";

export default function RoomflixCommandPalette({
  currentTitle,
  onClose,
  onLibraryChanged,
}: {
  currentTitle: DiscoverTitleDetails | null;
  onClose: () => void;
  onLibraryChanged: () => void;
}) {
  const navigate = useNavigate();
  const location = useLocation();
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
    const discoverReturnTo = location.pathname === "/discover/recent" || currentDiscoverState?.discoverReturnTo === "/discover/recent" ? "/discover/recent" : "/discover";
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
    trimmedQuery.length < 2 ? "Type a command, title, actor, director or producer." : searching ? "Searching Roomflix and TMDB…" : "No matching commands, titles or people.";

  return (
    <Modal open title="Quick find" onClose={onClose} className="max-w-2xl" overlayClassName="z-[200]">
      <div className="-m-5">
        <Command loop>
          <CommandInput autoFocus value={query} onValueChange={setQuery} placeholder="Search titles, people, or commands…" aria-label="Search titles, people, or commands" />
          <CommandList>
            <CommandEmpty>{emptyMessage}</CommandEmpty>

            {currentTitle ? (
              <CurrentTitleCommands details={currentTitle} libraryItem={libraryItem} onClose={onClose} onSaveStatus={saveStatus} onRemove={removeFromLibrary} />
            ) : null}

            <CommandSeparator />
            <CommandGroup heading="Navigate">
              <NavigationItem icon={Home} label="Home" path="/" goTo={goTo} />
              <NavigationItem icon={Compass} label="Discover" path="/discover" goTo={goTo} />
              <NavigationItem icon={Library} label="Library" path="/library" goTo={goTo} />
              <NavigationItem icon={History} label="History" path="/history" goTo={goTo} />
              <NavigationItem icon={Database} label="Storage" path="/storage" goTo={goTo} />
              <NavigationItem icon={Settings} label="Settings" path="/settings/profile" goTo={goTo} />
            </CommandGroup>

            {search?.people.length ? (
              <>
                <CommandSeparator />
                <CommandGroup heading={search.usedFuzzyFallback ? "Closest people" : "People"}>
                  {search.people.slice(0, 5).map((person) => (
                    <CommandItem
                      key={person.tmdbId}
                      forceMount
                      value={`person ${person.name} ${person.knownForDepartment}`}
                      onSelect={() => goTo(discoverPersonPath(person.tmdbId))}
                    >
                      <PaletteImage path={person.profilePath} person />
                      <span className="min-w-0 flex-1 truncate">{person.name}</span>
                      <CommandShortcut>{person.knownForDepartment || "Person"}</CommandShortcut>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            ) : null}

            {search?.titles.length ? (
              <>
                <CommandSeparator />
                <CommandGroup heading={search.usedFuzzyFallback ? "Closest titles" : "Titles"}>
                  {search.titles.slice(0, 10).map((title) => (
                    <CommandItem
                      key={titleIdentity(title)}
                      forceMount
                      value={`title ${title.title} ${title.year} ${title.mediaType}`}
                      onSelect={() => goTo(discoverTitlePath(title))}
                    >
                      <PaletteImage path={title.posterPath} />
                      <span className="min-w-0 flex-1 truncate">{title.title}</span>
                      <CommandShortcut>
                        {title.mediaType === "tv" ? "Series" : "Film"}
                        {title.year ? ` · ${title.year}` : ""}
                      </CommandShortcut>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            ) : null}
          </CommandList>
          <div className="flex items-center gap-4 border-t border-border px-4 py-2 text-[9px] uppercase tracking-wider text-muted-foreground">
            <span>↑↓ Navigate</span>
            <span>↵ Select</span>
            <span className="ml-auto">Esc Close</span>
          </div>
        </Command>
      </div>
    </Modal>
  );
}

function NavigationItem({ icon: Icon, label, path, goTo }: { icon: typeof Home; label: string; path: string; goTo: (path: string) => void }) {
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
