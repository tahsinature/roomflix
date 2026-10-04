import { Tooltip } from "@/components/ui/tooltip";
import { formatRuntime } from "@/features/discover/discover-utils";
import type { ComparisonTitle } from "./comparison-data";
import { SeriesStatusIndicator } from "@/features/discover/SeriesStatusIndicator";

export function ComparisonLength({ title }: { title: ComparisonTitle }) {
  if (title.mediaType === "movie") return <span className="text-[11px] text-foreground/80">{title.runtime ? formatRuntime(title.runtime) : "Unknown"}</span>;
  return (
    <Tooltip content={title.runtime ? `${formatRuntime(title.runtime)} per episode` : "Season and episode counts currently reported by TMDB"}>
      <div>
        <span className="flex items-center gap-1.5 text-[11px] text-foreground/80">
          <SeriesStatusIndicator
            data={{
              status: title.seriesStatus ?? "",
              nextEpisode: title.nextEpisode,
              firstAirDate: title.releaseDate,
              lastAirDate: title.lastAirDate,
              numberOfSeasons: title.numberOfSeasons,
              numberOfEpisodes: title.numberOfEpisodes,
            }}
          />
          {title.numberOfSeasons !== null ? `${title.numberOfSeasons} ${title.numberOfSeasons === 1 ? "season" : "seasons"}` : "Seasons unknown"}
        </span>
        <span className="block text-[9px] text-muted-foreground">
          {title.numberOfEpisodes !== null ? `${title.numberOfEpisodes} ${title.numberOfEpisodes === 1 ? "episode" : "episodes"}` : "Episodes unknown"}
        </span>
      </div>
    </Tooltip>
  );
}
