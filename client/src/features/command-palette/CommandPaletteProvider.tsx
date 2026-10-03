import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { DiscoverSearchResult, DiscoverTitleDetails } from "@shared/protocol";

const TitleSearchModal = lazy(() => import("./TitleSearchModal"));
const RoomflixCommandPalette = lazy(() => import("./RoomflixCommandPalette"));

export type ComparisonSearchActions = {
  addedIds: Set<string>;
  onAdd: (title: DiscoverSearchResult) => Promise<void>;
};

type CommandPaletteContextValue = {
  openPalette: () => void;
  openTitleSearch: () => void;
  openComparisonSearch: () => void;
  currentTitle: DiscoverTitleDetails | null;
  setCurrentTitle: (title: DiscoverTitleDetails | null) => void;
  libraryRevision: number;
  notifyLibraryChanged: () => void;
};

const CommandPaletteContext = createContext<CommandPaletteContextValue | null>(null);

export function CommandPaletteProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const [modal, setModal] = useState<"commands" | "titles" | "comparison" | null>(null);
  const [currentTitle, setCurrentTitle] = useState<DiscoverTitleDetails | null>(null);
  const [libraryRevision, setLibraryRevision] = useState(0);
  const openPalette = useCallback(() => setModal("commands"), []);
  const openTitleSearch = useCallback(() => setModal("titles"), []);
  const openComparisonSearch = useCallback(() => setModal("comparison"), []);
  const notifyLibraryChanged = useCallback(() => setLibraryRevision((revision) => revision + 1), []);

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.isComposing) return;
      const commandShortcut = event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey);
      const slashShortcut = event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey && !isEditable(event.target);
      if (!commandShortcut && !slashShortcut) return;
      event.preventDefault();
      setModal((current) => (commandShortcut ? (current === "commands" ? null : "commands") : "titles"));
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled]);

  const value = useMemo(
    () => ({ openPalette, openTitleSearch, openComparisonSearch, currentTitle, setCurrentTitle, libraryRevision, notifyLibraryChanged }),
    [openPalette, openTitleSearch, openComparisonSearch, currentTitle, libraryRevision, notifyLibraryChanged],
  );

  return (
    <CommandPaletteContext.Provider value={value}>
      {children}
      {enabled && modal ? (
        <Suspense fallback={null}>
          {modal === "commands" ? (
            <RoomflixCommandPalette currentTitle={currentTitle} onClose={() => setModal(null)} onLibraryChanged={notifyLibraryChanged} />
          ) : (
            <TitleSearchModal addToComparison={modal === "comparison"} onClose={() => setModal(null)} />
          )}
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
