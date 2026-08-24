import { Clapperboard, Star, Tv } from "lucide-react";
import type { DiscoverSearchResult, TitleLibraryItem } from "@shared/protocol";
import { cn } from "@/lib/utils";
import { formatVotes, posterUrl, titleIdentity, type TitleSelection } from "./discover-utils";

export function TitleGrid({
  titles,
  library,
  onSelect,
  compact = false,
}: {
  titles: DiscoverSearchResult[];
  library?: TitleLibraryItem[];
  onSelect: (selection: TitleSelection) => void;
  compact?: boolean;
}) {
  const libraryByTitle = new Map((library ?? []).map((item) => [titleIdentity(item), item]));

  return (
    <div className={cn("grid gap-3", compact ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5" : "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6")}>
      {titles.map((title) => {
        const saved = libraryByTitle.get(titleIdentity(title));
        const image = posterUrl(title.posterPath);
        const MediaIcon = title.mediaType === "tv" ? Tv : Clapperboard;
        return (
          <button
            key={titleIdentity(title)}
            type="button"
            onClick={() => onSelect(title)}
            className="group min-w-0 border border-border bg-card/45 text-left transition duration-200 hover:-translate-y-1 hover:border-accent/45 hover:shadow-[0_16px_40px_-24px_hsl(var(--accent)/0.65)]"
          >
            <div className="relative aspect-[2/3] overflow-hidden bg-bg-elevated">
              {image ? (
                <img src={image} alt="" loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.035]" />
              ) : (
                <div className="grid h-full place-items-center">
                  <MediaIcon className="h-8 w-8 text-text-dim" />
                </div>
              )}
              <span className="absolute left-2 top-2 inline-flex items-center gap-1 border border-white/20 bg-black/70 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.14em] text-white/80 backdrop-blur">
                <MediaIcon className="h-2.5 w-2.5" />
                {title.mediaType === "tv" ? "Series" : "Film"}
              </span>
              {saved ? (
                <span className="absolute right-2 top-2 border border-accent/40 bg-black/75 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.12em] text-accent">
                  {saved.status === "watched" ? "Watched" : "Saved"}
                </span>
              ) : null}
              {title.voteAverage > 0 ? (
                <span className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-gradient-to-t from-black via-black/85 to-transparent px-2 pb-2 pt-8 text-[10px] text-amber-300">
                  <Star className="h-3 w-3 fill-current" />
                  {title.voteAverage.toFixed(1)}
                  <span className="text-cyan-300/75">· {formatVotes(title.voteCount)}</span>
                </span>
              ) : null}
            </div>
            <div className="min-h-[4.5rem] p-2.5">
              <p className="line-clamp-2 text-xs font-semibold leading-snug text-foreground">{title.title}</p>
              <p className="mt-1 text-[10px] text-text-dim">{title.year || "Date unknown"}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
