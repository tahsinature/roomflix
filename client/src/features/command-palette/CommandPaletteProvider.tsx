import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { DiscoverTitleDetails } from "@shared/protocol";

const RoomflixCommandPalette = lazy(() => import("./RoomflixCommandPalette"));

type CommandPaletteContextValue = {
  openPalette: () => void;
  currentTitle: DiscoverTitleDetails | null;
  setCurrentTitle: (title: DiscoverTitleDetails | null) => void;
  libraryRevision: number;
  notifyLibraryChanged: () => void;
};

const CommandPaletteContext = createContext<CommandPaletteContextValue | null>(null);

export function CommandPaletteProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [currentTitle, setCurrentTitle] = useState<DiscoverTitleDetails | null>(null);
  const [libraryRevision, setLibraryRevision] = useState(0);
  const openPalette = useCallback(() => setOpen(true), []);
  const notifyLibraryChanged = useCallback(() => setLibraryRevision((revision) => revision + 1), []);

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const commandShortcut = event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey);
      const slashShortcut = event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey && !isEditable(event.target);
      if (!commandShortcut && !slashShortcut) return;
      event.preventDefault();
      setOpen((current) => (commandShortcut && current ? false : true));
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled]);

  const value = useMemo(
    () => ({ openPalette, currentTitle, setCurrentTitle, libraryRevision, notifyLibraryChanged }),
    [openPalette, currentTitle, libraryRevision, notifyLibraryChanged],
  );

  return (
    <CommandPaletteContext.Provider value={value}>
      {children}
      {enabled && open ? (
        <Suspense fallback={null}>
          <RoomflixCommandPalette currentTitle={currentTitle} onClose={() => setOpen(false)} onLibraryChanged={notifyLibraryChanged} />
        </Suspense>
      ) : null}
    </CommandPaletteContext.Provider>
  );
}

export function useCommandPalette(): CommandPaletteContextValue {
  const value = useContext(CommandPaletteContext);
  if (!value) throw new Error("useCommandPalette must be used inside CommandPaletteProvider");
  return value;
}

function isEditable(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
}
