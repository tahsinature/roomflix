import { Star } from "lucide-react";
import { Tooltip, TooltipDetails } from "@/components/ui/tooltip";

export function TmdbRatingDisplay({ rating, votes }: { rating: number | null; votes: number | null }) {
  const hasRating = rating !== null && votes !== 0;
  const reason = votes === 0 ? "No ratings yet" : "TMDB rating unavailable";
  return (
    <Tooltip content={<TooltipDetails heading="TMDB rating" tone="text-cyan" description={hasRating ? "Average rating out of 10" : reason} />}>
      <span className="block">
        <span className="flex items-center gap-1 whitespace-nowrap">
          {hasRating ? (
            <>
              <Star className="size-3 shrink-0 fill-cyan text-cyan" aria-hidden="true" />
              <span className="text-base font-medium tabular-nums text-foreground" aria-label={`${rating.toFixed(1)} out of 10`}>
                {rating.toFixed(1)}
              </span>
              <span className="text-[9px] text-muted-foreground" aria-hidden="true">
                / 10
              </span>
            </>
          ) : (
            <span className="text-[11px] text-muted-foreground">{reason}</span>
          )}
        </span>
        <span className="block text-[9px] leading-4 tabular-nums text-muted-foreground">{votes !== null ? `${votes.toLocaleString()} ratings` : "Rating count unavailable"}</span>
      </span>
    </Tooltip>
  );
}
