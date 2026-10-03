import { Star } from "lucide-react";
import type { ImdbRatings } from "@shared/protocol";

const voteFormatter = new Intl.NumberFormat();
export const imdbFailureMessages: Record<Exclude<ImdbRatings["status"], "available">, string> = {
  not_found: "No IMDb ratings found",
  not_configured: "API key not configured",
  invalid_key: "API key rejected",
  quota_exceeded: "Daily API limit reached",
  unauthorized: "Sign in to load ratings",
  unavailable: "Could not load ratings",
};

export function ImdbRatingDisplay({ ratings, compact = false }: { ratings: ImdbRatings | null; compact?: boolean }) {
  const reason = ratings && ratings.status !== "available" ? imdbFailureMessages[ratings.status] : null;
  const tooltip = reason ?? `IMDb · Average rating out of 10 · via OMDb${ratings?.fetchedAt ? ` · fetched ${new Date(ratings.fetchedAt).toLocaleString()}` : ""}`;
  return (
    <span className={compact ? "block" : "flex flex-wrap items-center gap-x-1.5 gap-y-0.5"} title={tooltip} role="status">
      <span className="flex items-center gap-1 whitespace-nowrap">
        {!compact ? "IMDb " : null}
        {ratings?.rating != null ? <Star className="size-3 shrink-0 fill-amber-300 text-amber-300" aria-hidden="true" /> : null}
        {ratings?.rating != null ? (
          <>
            <span className={compact ? "text-base font-medium tabular-nums text-foreground" : "font-medium tabular-nums"} aria-label={`${ratings.rating.toFixed(1)} out of 10`}>
              {ratings.rating.toFixed(1)}
            </span>
            {compact ? (
              <span className="text-[9px] text-muted-foreground" aria-hidden="true">
                / 10
              </span>
            ) : null}
          </>
        ) : (
          <span className={compact ? "text-[11px] text-muted-foreground" : ""}>{ratings ? "Unavailable" : "Loading…"}</span>
        )}
      </span>
      {!compact && ratings?.rating != null && ratings.votes !== null && !reason ? (
        <span className="text-muted-foreground" aria-hidden="true">
          ·
        </span>
      ) : null}
      <span className={compact ? "block text-[9px] leading-4 tabular-nums text-muted-foreground" : "whitespace-nowrap tabular-nums text-muted-foreground"}>
        {reason ?? (ratings ? (ratings.votes !== null ? `${voteFormatter.format(ratings.votes)} ratings` : "Rating count unavailable") : "Fetching rating and count")}
      </span>
    </span>
  );
}
