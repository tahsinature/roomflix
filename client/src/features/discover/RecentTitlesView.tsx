import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { Check, Clapperboard, Clock3, Loader2, RotateCw, Search, Trash2, Tv } from "lucide-react";
import { RECENT_TITLE_LIMIT, type RecentTitleItem, type TitleLibraryItem } from "@shared/protocol";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatVotes, posterUrl, titleIdentity, type TitleSelection } from "./discover-utils";
import { filterAndSortRecentTitles, type RecentRange, type RecentSort } from "./recent-titles";
import { prefetchTitleDetails } from "./title-details-cache";

const RANGE_OPTIONS: Array<{ value: RecentRange; label: string }> = [
  { value: "all", label: "All time" },
  { value: "week", label: "7 days" },
  { value: "month", label: "30 days" },
  { value: "year", label: "1 year" },
];

const exactDateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

export function RecentTitlesView({
  titles,
  library,
  onSelect,
  onClear,
  onExplore,
  loading,
  error,
  onRetry,
}: {
  titles: RecentTitleItem[];
  library: TitleLibraryItem[];
  onSelect: (selection: TitleSelection) => void;
  onClear: () => Promise<void>;
  onExplore: () => void;
  loading: boolean;
  error: string;
  onRetry: () => void;
}) {
  const [query, setQuery] = useState("");
  const [range, setRange] = useState<RecentRange>("all");
  const [sort, setSort] = useState<RecentSort>("newest");
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const deferredQuery = useDeferredValue(query);
  const visibleTitles = useMemo(() => filterAndSortRecentTitles(titles, { query: deferredQuery, range, sort }), [deferredQuery, range, sort, titles]);
  const libraryByTitle = useMemo(() => new Map(library.map((item) => [titleIdentity(item), item])), [library]);

  useEffect(() => {
    if (!confirmingClear) return;
    const timer = window.setTimeout(() => setConfirmingClear(false), 5_000);
    return () => window.clearTimeout(timer);
  }, [confirmingClear]);

  const clear = async () => {
    if (!confirmingClear) {
      setConfirmingClear(true);
      return;
    }
    setClearing(true);
    try {
      await onClear();
      setConfirmingClear(false);
    } finally {
      setClearing(false);
    }
  };

  return (
    <section className="view-enter">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="section-label">Recently viewed</h1>
          <p className="mt-2 text-xs text-muted-foreground">Synced to your Roomflix account · latest {RECENT_TITLE_LIMIT} unique titles.</p>
        </div>
        {titles.length ? (
          <Button
            type="button"
            variant={confirmingClear ? "outline" : "ghost"}
            size="sm"
            disabled={clearing}
            onClick={() => void clear()}
            className={cn("self-start sm:self-auto", confirmingClear ? "border-accent/50 text-accent" : "text-muted-foreground hover:text-accent")}
          >
            {confirmingClear ? <Check className="h-3.5 w-3.5" /> : <Trash2 className="h-3.5 w-3.5" />}
            {clearing ? "Clearing…" : confirmingClear ? "Confirm clear" : "Clear history"}
          </Button>
        ) : null}
      </div>

      {error ? (
        <div role="alert" className="mt-4 flex items-center justify-between gap-3 border border-accent/30 bg-accent/[0.06] px-3 py-2 text-xs text-accent">
          <span>{error}</span>
          <Button type="button" variant="ghost" size="sm" onClick={onRetry}>
            <RotateCw className="h-3.5 w-3.5" /> Retry
          </Button>
        </div>
      ) : null}

      {titles.length ? (
        <>
          <div className="mt-5 grid gap-3 border border-border bg-card/30 p-3 lg:grid-cols-[minmax(15rem,1fr)_auto_auto] lg:items-center">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-dim" />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter recent titles…" className="h-10 pl-9" aria-label="Filter recent titles" />
            </div>

            <div role="group" className="grid grid-cols-4 border border-border" aria-label="Viewed within">
              {RANGE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={range === option.value}
                  onClick={() => setRange(option.value)}
                  className={cn(
                    "border-r border-border px-2 py-2 text-[9px] uppercase tracking-[0.1em] transition-colors last:border-r-0 sm:px-3",
                    range === option.value ? "bg-accent/10 text-accent" : "text-muted-foreground hover:bg-white/[0.03] hover:text-foreground",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <label className="flex items-center justify-between gap-2 text-[9px] uppercase tracking-[0.12em] text-text-dim lg:justify-start">
              Sort
              <select
                value={sort}
                onChange={(event) => setSort(event.target.value as RecentSort)}
                className="h-10 min-w-36 border border-border bg-bg-elevated px-3 text-xs normal-case tracking-normal text-foreground outline-none focus:border-accent/60"
              >
                <option value="newest">Newest viewed</option>
                <option value="oldest">Oldest viewed</option>
                <option value="title">Title A–Z</option>
                <option value="most-viewed">Most viewed</option>
              </select>
            </label>
          </div>

          <div className="mt-3 flex items-center justify-between gap-3 text-[9px] uppercase tracking-[0.12em] text-text-dim">
            <span>
              {visibleTitles.length} of {titles.length} titles
            </span>
            <span>Cmd / Ctrl + F supported</span>
          </div>

          {visibleTitles.length ? (
            <div className="mt-3 divide-y divide-border border border-border bg-card/20">
              {visibleTitles.map((title) => (
                <RecentTitleRow key={titleIdentity(title)} title={title} savedLabel={libraryByTitle.get(titleIdentity(title))?.status} onSelect={() => onSelect(title)} />
              ))}
            </div>
          ) : (
            <div className="mt-3 border border-border bg-card/25 px-6 py-12 text-center">
              <Search className="mx-auto h-6 w-6 text-text-dim" />
              <p className="mt-3 text-sm font-semibold">No titles match these filters</p>
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setRange("all");
                }}
                className="mt-3 text-xs text-accent underline decoration-accent/40 underline-offset-4"
              >
                Reset filters
              </button>
            </div>
          )}
        </>
      ) : loading ? (
        <div className="mt-4 grid min-h-48 place-items-center border border-border bg-card/25">
          <span role="status" className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.13em] text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin text-accent" /> Loading account history…
          </span>
        </div>
      ) : (
        <div className="mt-4 border border-border bg-card/35 px-6 py-14 text-center">
          <Clock3 className="mx-auto h-7 w-7 text-text-dim" />
          <p className="mt-3 text-sm font-semibold">No recently viewed titles</p>
          <p className="mx-auto mt-2 max-w-sm text-xs leading-relaxed text-muted-foreground">Titles appear here after you open their details.</p>
          <button type="button" onClick={onExplore} className="mt-4 text-xs text-accent underline decoration-accent/40 underline-offset-4">
            Find something worth watching
          </button>
        </div>
      )}
    </section>
  );
}

function RecentTitleRow({ title, savedLabel, onSelect }: { title: RecentTitleItem; savedLabel?: TitleLibraryItem["status"]; onSelect: () => void }) {
  const image = posterUrl(title.posterPath, "w185");
  const MediaIcon = title.mediaType === "tv" ? Tv : Clapperboard;
  const viewedAt = new Date(title.lastViewedAt);

  return (
    <button
      type="button"
      onClick={onSelect}
      onPointerEnter={() => prefetchTitleDetails(title)}
      onFocus={() => prefetchTitleDetails(title)}
      className="group grid w-full grid-cols-[3rem_minmax(0,1fr)] gap-3 p-3 text-left transition-colors [content-visibility:auto] [contain-intrinsic-size:76px] hover:bg-white/[0.025] focus-visible:bg-white/[0.035] sm:grid-cols-[3.5rem_minmax(0,1fr)_auto] sm:items-center sm:gap-4"
    >
      <div className="relative aspect-[2/3] overflow-hidden border border-border bg-bg-elevated">
        {image ? (
          <img
            src={image}
            alt=""
            width={185}
            height={278}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.04]"
          />
        ) : (
          <span className="grid h-full place-items-center">
            <MediaIcon className="h-4 w-4 text-text-dim" />
          </span>
        )}
      </div>

      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-semibold group-hover:text-accent">{title.title}</span>
          {savedLabel ? (
            <span className="shrink-0 border border-accent/35 px-1.5 py-0.5 text-[8px] uppercase tracking-[0.1em] text-accent">
              {savedLabel === "watched" ? "Watched" : "Saved"}
            </span>
          ) : null}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[9px] uppercase tracking-[0.11em] text-text-dim">
          <span>{title.mediaType === "tv" ? "Series" : "Film"}</span>
          <span>{title.year || "Date unknown"}</span>
          {title.voteAverage > 0 ? (
            <span>
              ★ {title.voteAverage.toFixed(1)} · {formatVotes(title.voteCount)} votes
            </span>
          ) : null}
        </div>
        <div className="mt-2 text-[10px] text-muted-foreground sm:hidden">
          <time dateTime={viewedAt.toISOString()}>{formatExactDate(title.lastViewedAt)}</time> · {formatRelativeDate(title.lastViewedAt)} · {formatViewCount(title.viewCount)}
        </div>
      </div>

      <div className="hidden min-w-52 text-right sm:block">
        <time dateTime={viewedAt.toISOString()} className="block text-[11px] text-foreground/80">
          {formatExactDate(title.lastViewedAt)}
        </time>
        <span className="mt-1 block text-[9px] uppercase tracking-[0.1em] text-text-dim">
          {formatRelativeDate(title.lastViewedAt)} · {formatViewCount(title.viewCount)}
        </span>
      </div>
    </button>
  );
}

function formatExactDate(timestamp: number): string {
  return exactDateFormatter.format(timestamp);
}

function formatRelativeDate(timestamp: number, now = Date.now()): string {
  const elapsed = Math.max(0, now - timestamp);
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function formatViewCount(count: number): string {
  return `${count} ${count === 1 ? "view" : "views"}`;
}
