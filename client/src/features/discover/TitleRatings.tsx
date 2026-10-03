import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import { formatVotes } from "./discover-utils";
import { imdbFailureMessages } from "./ImdbRatingDisplay";
import { TitleMetadataCard } from "./TitleMetadataCard";
import { TitleRuntime } from "./TitleRuntime";
import type { ImdbRatings, DiscoverMediaType } from "@shared/protocol";
import { loadImdbRatings } from "./imdb-ratings-cache";

export function TitleRatings({
  imdbId,
  tmdbRating,
  tmdbVotes,
  runtime,
  mediaType,
}: {
  imdbId: string | null;
  tmdbRating: number;
  tmdbVotes: number;
  runtime: number | null;
  mediaType: DiscoverMediaType;
}) {
  const [result, setResult] = useState<{ id: string | null; data: ImdbRatings } | null>(null);
  useEffect(() => {
    let cancelled = false;
    void loadImdbRatings(imdbId).then((data) => {
      if (!cancelled) setResult({ id: imdbId, data });
    });
    return () => {
      cancelled = true;
    };
  }, [imdbId]);
  const ratings = result?.id === imdbId ? result.data : null;
  const imdbCaption = !ratings
    ? "Fetching rating and count"
    : ratings.status !== "available"
      ? imdbFailureMessages[ratings.status]
      : ratings.votes !== null
        ? `${new Intl.NumberFormat().format(ratings.votes)} ratings`
        : "Rating count unavailable";
  return (
    <div aria-label="Ratings and runtime" className="grid w-full max-w-lg grid-cols-3 items-stretch gap-2">
      <TitleMetadataCard
        label="IMDb"
        icon={Star}
        tone="text-amber-300"
        title="IMDb · Average rating out of 10 · via OMDb"
        value={
          ratings?.rating != null ? (
            <span aria-label={`${ratings.rating.toFixed(1)} out of 10`}>{ratings.rating.toFixed(1)}</span>
          ) : (
            <span className="text-[11px] font-normal">{ratings ? "Unavailable" : "Loading…"}</span>
          )
        }
        caption={imdbCaption}
      />
      <TitleMetadataCard
        label="TMDB"
        icon={Star}
        tone="text-cyan"
        title="TMDB · Average rating out of 10"
        value={<span aria-label={`${tmdbRating.toFixed(1)} out of 10`}>{tmdbRating.toFixed(1)}</span>}
        caption={`${formatVotes(tmdbVotes)} ratings`}
      />
      <TitleRuntime minutes={runtime} mediaType={mediaType} />
    </div>
  );
}
