import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Compass, Database, GitCompareArrows, History, Library, Settings, type LucideIcon } from "lucide-react";
import type { DiscoverTitleDetails, TitleLibraryItem, TitleLibraryStatus } from "@shared/protocol";
import { Modal } from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { api } from "@/lib/api";
import { titleIdentity, toLibraryPayload } from "@/features/discover/discover-utils";
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
  const { error: showError, success: showSuccess } = useToast();
  const [query, setQuery] = useState("");
  const [libraryItem, setLibraryItem] = useState<TitleLibraryItem | undefined>();

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

  const goTo = (path: string) => {
    onClose();
    navigate(path);
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

  return (
    <Modal open title="App commands" onClose={onClose} className="max-w-2xl" overlayClassName="z-[200]">
      <div className="-m-5">
        <Command loop>
          <CommandInput autoFocus value={query} onValueChange={setQuery} placeholder="Search app navigation and actions…" aria-label="Search app commands" />
          <CommandList>
            <CommandEmpty>No matching commands.</CommandEmpty>
            {currentTitle ? (
              <CurrentTitleCommands details={currentTitle} libraryItem={libraryItem} onClose={onClose} onSaveStatus={saveStatus} onRemove={removeFromLibrary} />
            ) : null}

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
          </CommandList>
          <div className="flex items-center gap-4 border-t border-border px-4 py-2 text-[9px] uppercase tracking-wider text-muted-foreground">
            <span>↑↓ Navigate</span>
            <span>↵ Run</span>
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
