import { useEffect, useRef, useState } from "react";
import { Bookmark, CheckCircle2, Clock3, Compass, Loader2, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ViewButton, type DiscoverView } from "./DiscoverPageParts";

type DiscoverModeBarProps = {
  view: DiscoverView;
  shortlistCount: number;
  watchedCount: number;
  recentCount: number;
  query: string;
  searching: boolean;
  onQueryChange: (query: string) => void;
  onSelectView: (view: DiscoverView) => void;
  onActivateSearch: () => void;
};

export function DiscoverModeBar({
  view,
  shortlistCount,
  watchedCount,
  recentCount,
  query,
  searching,
  onQueryChange,
  onSelectView,
  onActivateSearch,
}: DiscoverModeBarProps) {
  const [searchOpen, setSearchOpen] = useState(() => view === "explore" && query.trim().length > 0);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (view !== "explore") setSearchOpen(false);
  }, [view]);

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  const selectView = (nextView: DiscoverView) => {
    setSearchOpen(false);
    onSelectView(nextView);
  };

  const openSearch = () => {
    setSearchOpen(true);
    onActivateSearch();
  };

  const closeSearch = () => {
    onQueryChange("");
    setSearchOpen(false);
  };

  const backgroundTabIndex = searchOpen ? -1 : 0;

  return (
    <div className="relative grid min-h-11 grid-cols-4 overflow-hidden border border-border bg-card/35">
      <div
        aria-hidden={!searchOpen}
        className={cn(
          "absolute inset-y-0 left-0 z-20 grid w-full origin-left grid-cols-[2.75rem_minmax(0,1fr)] border-r border-border bg-bg-elevated shadow-[8px_0_24px_rgba(0,0,0,0.25)] transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none lg:w-1/4",
          searchOpen ? "pointer-events-auto translate-x-0 scale-x-100 opacity-100" : "pointer-events-none -translate-x-2 scale-x-[0.96] opacity-0",
        )}
      >
        <button
          type="button"
          onClick={closeSearch}
          tabIndex={searchOpen ? 0 : -1}
          aria-label="Close search and return to Explore"
          title="Back to Explore"
          className="grid place-items-center border-r border-border text-muted-foreground transition-colors hover:bg-white/[0.03] hover:text-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-accent/60"
        >
          <Compass className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <DiscoverSearchField
          inputRef={searchInputRef}
          active={searchOpen}
          query={query}
          searching={searching}
          onQueryChange={onQueryChange}
          onClose={closeSearch}
        />
      </div>

      <div className="grid min-w-0 grid-cols-2 border-r border-border">
        <ModeButton
          active={view === "explore" && !searchOpen}
          icon={Compass}
          label="Explore"
          tabIndex={backgroundTabIndex}
          onClick={() => selectView("explore")}
        />
        <ModeButton active={searchOpen} icon={Search} label="Search" tabIndex={backgroundTabIndex} onClick={openSearch} />
      </div>

      <ViewButton active={view === "shortlist"} onClick={() => selectView("shortlist")} icon={Bookmark} count={shortlistCount} tabIndex={backgroundTabIndex}>
        Watchlist
      </ViewButton>
      <ViewButton active={view === "watched"} onClick={() => selectView("watched")} icon={CheckCircle2} count={watchedCount} tabIndex={backgroundTabIndex}>
        Watched
      </ViewButton>
      <ViewButton active={view === "recent"} onClick={() => selectView("recent")} icon={Clock3} count={recentCount} tabIndex={backgroundTabIndex}>
        Recent
      </ViewButton>
    </div>
  );
}

function ModeButton({
  active,
  icon: Icon,
  label,
  tabIndex,
  onClick,
}: {
  active: boolean;
  icon: typeof Compass;
  label: string;
  tabIndex: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      tabIndex={tabIndex}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "flex min-w-0 items-center justify-center gap-1.5 border-r border-border px-1.5 text-[10px] uppercase tracking-[0.11em] transition-colors last:border-r-0 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-accent/60 xl:px-2 xl:text-xs",
        active ? "bg-accent/10 text-accent" : "text-muted-foreground hover:bg-white/[0.02] hover:text-foreground",
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="hidden min-w-0 truncate xl:inline">{label}</span>
    </button>
  );
}

function DiscoverSearchField({
  inputRef,
  active,
  query,
  searching,
  onQueryChange,
  onClose,
}: {
  inputRef: React.RefObject<HTMLInputElement>;
  active: boolean;
  query: string;
  searching: boolean;
  onQueryChange: (query: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="relative min-w-0 bg-accent/[0.06]">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-accent" aria-hidden="true" />
      <Input
        ref={inputRef}
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
        }}
        tabIndex={active ? 0 : -1}
        placeholder="Search titles or people…"
        aria-label="Search movies, series, or people"
        className="h-full min-h-11 border-0 bg-transparent pl-9 pr-16 text-xs focus-visible:border-0 focus-visible:bg-accent/[0.04]"
      />
      {searching ? <Loader2 className="absolute right-10 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-accent motion-reduce:animate-none" aria-label="Searching" /> : null}
      <button
        type="button"
        onClick={onClose}
        tabIndex={active ? 0 : -1}
        aria-label="Close search"
        className="absolute right-1.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/60"
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}
