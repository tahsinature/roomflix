import { useEffect, useState } from "react";
import type { DiscoverSearchResult, ImdbRatings } from "@shared/protocol";
import { Star } from "lucide-react";
import { Tooltip } from "@/components/ui/tooltip";
import { loadCardRatings } from "./card-ratings-cache";
import { imdbFailureMessages } from "./ImdbRatingDisplay";
import { formatVotes } from "./discover-utils";

export function TitleCardRatings({ title, knownImdbId }: { title: DiscoverSearchResult; knownImdbId?: string | null }) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<{ key: string; data: ImdbRatings } | null>(null);
  const key = `${title.mediaType}:${title.tmdbId}`;
  const ratings = result?.key === key ? result.data : null;
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void loadCardRatings(title.mediaType, title.tmdbId, knownImdbId).then((data) => {
      if (!cancelled) setResult({ key, data });
    });
    return () => {
      cancelled = true;
    };
  }, [open, key, title.mediaType, title.tmdbId, knownImdbId]);
  const imdbReason = ratings && ratings.status !== "available" ? imdbFailureMessages[ratings.status] : null;
  const tmdbRating = title.voteCount > 0 ? title.voteAverage : null;
  return (
    <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/85 to-transparent px-2 pb-2 pr-8 pt-8">
      <Tooltip
        open={open}
        onOpenChange={setOpen}
        content={
          <span className="block min-w-44">
            <span className="mb-2 block text-[9px] uppercase tracking-wider text-muted-foreground">Audience ratings</span>
            <RatingSummary
              source="IMDb"
              tone="text-amber-300"
              rating={ratings?.rating ?? null}
              votes={ratings?.votes ?? null}
              reason={imdbReason ?? (ratings ? "Rating unavailable" : "Loading IMDb rating…")}
            />
            <span className="my-2 block border-t border-border-hover" />
            <RatingSummary source="TMDB" tone="text-cyan" rating={tmdbRating} votes={title.voteCount} reason="No ratings yet" />
          </span>
        }
      >
        <button
          type="button"
          aria-label={`TMDB ${tmdbRating !== null ? `${tmdbRating.toFixed(1)} out of 10, ${title.voteCount.toLocaleString()} ratings` : "no ratings yet"}. View IMDb and TMDB ratings.`}
          aria-expanded={open}
          onPointerDown={(event) => event.preventDefault()}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setOpen((current) => !current);
          }}
          className="pointer-events-auto inline-flex items-center gap-1 rounded-sm text-[10px] text-cyan focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent"
        >
          <Star className="size-3 fill-current" aria-hidden="true" />
          <span className="tabular-nums">{tmdbRating !== null ? tmdbRating.toFixed(1) : "—"}</span>
          <span className="text-cyan/80">· {formatVotes(title.voteCount)}</span>
        </button>
      </Tooltip>
    </span>
  );
}

function RatingSummary({ source, tone, rating, votes, reason }: { source: string; tone: string; rating: number | null; votes: number | null; reason: string }) {
  return (
    <span className="block">
      <span className={`flex items-center justify-between gap-4 font-medium ${tone}`}>
        <span>{source}</span>
        {rating !== null ? (
          <span className="inline-flex items-center gap-1 tabular-nums">
            <Star className="size-3 fill-current" aria-hidden="true" />
            {rating.toFixed(1)}
            <span className="text-[9px] font-normal text-muted-foreground">/ 10</span>
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </span>
      <span className="mt-1 block text-[10px] text-muted-foreground">
        {rating !== null ? (votes !== null ? `${votes.toLocaleString()} ratings` : "Rating count unavailable") : reason}
      </span>
    </span>
  );
}
