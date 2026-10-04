import { useEffect, useRef, useState } from "react";
import type { DiscoverSearchResult, ImdbRatings } from "@shared/protocol";
import { Star } from "lucide-react";
import { Tooltip, TooltipDetails } from "@/components/ui/tooltip";
import { loadCardRatings } from "./card-ratings-cache";
import { imdbFailureMessages } from "./ImdbRatingDisplay";

export function TitleCardRatings({ title, knownImdbId }: { title: DiscoverSearchResult; knownImdbId?: string | null }) {
  const anchor = useRef<HTMLSpanElement>(null);
  const [result, setResult] = useState<{ key: string; data: ImdbRatings } | null>(null);
  const key = `${title.mediaType}:${title.tmdbId}`;
  const ratings = result?.key === key ? result.data : null;
  useEffect(() => {
    let cancelled = false;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      void loadCardRatings(title.mediaType, title.tmdbId, knownImdbId).then((data) => {
        if (!cancelled) setResult({ key, data });
      });
    });
    if (anchor.current) observer.observe(anchor.current);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [key, title.mediaType, title.tmdbId, knownImdbId]);
  const imdbReason = ratings && ratings.status !== "available" ? imdbFailureMessages[ratings.status] : null;
  return (
    <span
      ref={anchor}
      className="absolute inset-x-0 bottom-0 flex flex-col items-start gap-0.5 bg-gradient-to-t from-black via-black/85 to-transparent px-2 pb-2 pr-8 pt-8 text-[9px]"
    >
      <CardRating
        source="IMDb"
        tone="text-amber-300"
        rating={ratings?.rating ?? null}
        votes={ratings?.votes ?? null}
        reason={imdbReason ?? (ratings ? "Rating unavailable" : "Loading IMDb rating…")}
      />
      <CardRating source="TMDB" tone="text-cyan" rating={title.voteCount > 0 ? title.voteAverage : null} votes={title.voteCount} reason="No TMDB ratings yet" />
    </span>
  );
}

function CardRating({ source, tone, rating, votes, reason }: { source: string; tone: string; rating: number | null; votes: number | null; reason: string }) {
  return (
    <Tooltip
      content={
        <TooltipDetails
          heading={`${source} rating`}
          tone={tone}
          description={rating !== null ? "Average rating out of 10" : reason}
          footer={votes !== null ? `${votes.toLocaleString()} ratings` : undefined}
        />
      }
    >
      <span className={`inline-flex items-center gap-0.5 whitespace-nowrap ${tone}`} aria-label={`${source}: ${rating !== null ? `${rating.toFixed(1)} out of 10` : reason}`}>
        <span className="w-6 text-[8px] font-medium">{source}</span>
        <span className="size-2.5 shrink-0" aria-hidden="true">
          {rating !== null ? <Star className="size-2.5 fill-current" /> : null}
        </span>
        <span className="tabular-nums">{rating !== null ? rating.toFixed(1) : "—"}</span>
      </span>
    </Tooltip>
  );
}
