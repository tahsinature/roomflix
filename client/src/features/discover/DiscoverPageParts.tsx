import { Clapperboard, UserRound, type LucideIcon } from "lucide-react";
import type { DiscoverPersonResult } from "@shared/protocol";
import { cn } from "@/lib/utils";
import { posterUrl, type TitleSelection } from "./discover-utils";
import { prefetchPersonDetails } from "./person-details-cache";
import { prefetchImageGallery } from "./image-gallery-cache";

export type DiscoverView = "search" | "shortlist" | "watched" | "recent";

export function ViewButton({
  active,
  onClick,
  icon: Icon,
  count,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: LucideIcon;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex min-w-0 items-center justify-center gap-1 border-r border-border px-1.5 py-3 text-[10px] uppercase tracking-[0.11em] transition last:border-r-0 sm:gap-2 sm:px-2 sm:text-xs",
        active ? "bg-accent/10 text-accent" : "text-muted-foreground hover:bg-white/[0.02] hover:text-foreground",
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="min-w-0 truncate">{children}</span>
      {count !== undefined ? (
        <span className="min-w-4 shrink-0 border border-border bg-black/15 px-1 py-0.5 text-center text-[8px] tabular-nums leading-none sm:text-[9px]">{count}</span>
      ) : null}
    </button>
  );
}

export function PersonResult({
  person,
  onSelect,
  onSelectPhotos,
  onSelectTitle,
}: {
  person: DiscoverPersonResult;
  onSelect: () => void;
  onSelectPhotos: () => void;
  onSelectTitle: (selection: TitleSelection) => void;
}) {
  const image = posterUrl(person.profilePath, "w185");
  return (
    <article
      className="flex min-w-0 gap-3 border border-border bg-card/45 p-3"
      onPointerEnter={() => prefetchPersonDetails(person.tmdbId)}
      onFocusCapture={() => prefetchPersonDetails(person.tmdbId)}
    >
      <button
        type="button"
        onClick={onSelectPhotos}
        onPointerEnter={() => prefetchImageGallery({ type: "person", tmdbId: person.tmdbId })}
        onFocus={() => prefetchImageGallery({ type: "person", tmdbId: person.tmdbId })}
        aria-label={`View photos of ${person.name}`}
        className="h-20 w-16 shrink-0 overflow-hidden border border-border bg-bg-elevated"
      >
        {image ? (
          <img src={image} alt="" className="h-full w-full object-cover grayscale hover:grayscale-0" />
        ) : (
          <span className="grid h-full place-items-center">
            <UserRound className="h-5 w-5 text-text-dim" />
          </span>
        )}
      </button>
      <div className="min-w-0">
        <button type="button" onClick={onSelect} className="text-left text-sm font-semibold hover:text-accent">
          {person.name}
        </button>
        <p className="mt-0.5 text-[9px] uppercase tracking-[0.12em] text-muted-foreground">{person.knownForDepartment}</p>
        <div className="mt-2 flex flex-wrap gap-x-2 gap-y-1">
          {person.knownFor.slice(0, 3).map((title) => (
            <button
              key={`${title.mediaType}-${title.tmdbId}`}
              type="button"
              onClick={() => onSelectTitle(title)}
              className="max-w-full truncate text-[9px] text-cyan hover:text-foreground"
            >
              {title.title}
            </button>
          ))}
        </div>
      </div>
    </article>
  );
}

export function LoadingGrid() {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-3 sm:grid-cols-[repeat(auto-fill,minmax(8rem,1fr))]">
      {Array.from({ length: 12 }, (_, index) => (
        <div key={index} className="aspect-[2/3] animate-pulse border border-border bg-card/60" />
      ))}
    </div>
  );
}

export function EmptyLibrary({ view, onSearch }: { view: Exclude<DiscoverView, "search" | "recent">; onSearch: () => void }) {
  return (
    <div className="border border-border bg-card/35 px-6 py-14 text-center">
      <Clapperboard className="mx-auto h-7 w-7 text-text-dim" />
      <p className="mt-3 text-sm font-semibold">Nothing {view === "watched" ? "watched" : "saved"} yet</p>
      <button type="button" onClick={onSearch} className="mt-3 text-xs text-accent underline decoration-accent/40 underline-offset-4">
        Find something worth watching
      </button>
    </div>
  );
}
