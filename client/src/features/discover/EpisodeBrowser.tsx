import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronRight, Clock3, Loader2, RotateCw, Star } from "lucide-react";
import type { DiscoverSeasonDetails, DiscoverSeasonSummary, DiscoverTitleDetails } from "@shared/protocol";
import { Button } from "@/components/ui/button";
import { useHistoryEntryState } from "@/navigation/history-entry-memory";
import { cn } from "@/lib/utils";
import { loadSeasonDetails, prefetchEpisodeDetails } from "./episode-cache";
import { formatRuntime, tmdbImageUrl, type EpisodeSelection } from "./discover-utils";
import { SectionLabel } from "./TitleDetailSections";

export function EpisodeBrowser({ details, onSelectEpisode }: { details: DiscoverTitleDetails; onSelectEpisode: (selection: EpisodeSelection) => void }) {
  const seasons = useMemo(() => orderSeasons(details.seasons), [details.seasons]);
  const initialSeason = seasons.find((season) => season.seasonNumber > 0)?.seasonNumber ?? seasons[0]?.seasonNumber ?? 0;
  const [selectedSeason, setSelectedSeason] = useHistoryEntryState(`discover.series-${details.tmdbId}.season`, initialSeason);
  const [seasonDetails, setSeasonDetails] = useState<DiscoverSeasonDetails | null>(null);
  const [error, setError] = useState("");
  const [retryRevision, setRetryRevision] = useState(0);
  const selectedSummary = seasons.find((season) => season.seasonNumber === selectedSeason) ?? seasons[0];
  const activeSeasonNumber = selectedSummary?.seasonNumber ?? 0;

  useEffect(() => {
    if (!selectedSummary) return;
    let cancelled = false;
    setSeasonDetails(null);
    setError("");
    void loadSeasonDetails(details.tmdbId, activeSeasonNumber)
      .then((season) => {
        if (!cancelled) setSeasonDetails(season);
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "This season is unavailable.");
      });
    return () => {
      cancelled = true;
    };
  }, [activeSeasonNumber, details.tmdbId, retryRevision, selectedSummary]);

  if (!seasons.length) {
    return (
      <section>
        <SectionLabel>Episodes</SectionLabel>
        <div className="mt-3 border border-border bg-background/35 p-6 text-xs text-muted-foreground">No season information is available yet.</div>
      </section>
    );
  }

  return (
    <section className="min-w-0">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <SectionLabel>Episodes</SectionLabel>
          <p className="mt-2 text-[10px] text-muted-foreground">Choose a season, then open any episode for its full details.</p>
        </div>
        <span className="text-[9px] uppercase tracking-[0.14em] text-text-dim">
          {details.numberOfEpisodes ?? seasons.reduce((total, season) => total + season.episodeCount, 0)} episodes
        </span>
      </div>

      <div className="mt-4 flex gap-1.5 overflow-x-auto border-y border-border py-2 [scrollbar-width:thin]" aria-label="Seasons">
        {seasons.map((season) => {
          const active = season.seasonNumber === activeSeasonNumber;
          return (
            <button
              key={season.tmdbId}
              type="button"
              aria-pressed={active}
              onClick={() => setSelectedSeason(season.seasonNumber)}
              className={cn(
                "shrink-0 border px-3 py-2 text-[9px] uppercase tracking-[0.12em] transition-[color,border-color,background-color]",
                active ? "border-accent/45 bg-accent/10 text-accent" : "border-border bg-background/40 text-muted-foreground hover:border-border-hover hover:text-foreground",
              )}
            >
              {season.seasonNumber === 0 ? "Specials" : `Season ${season.seasonNumber}`}
              <span className="ml-2 text-text-dim">{season.episodeCount}</span>
            </button>
          );
        })}
      </div>

      <SeasonIntroduction season={seasonDetails ?? selectedSummary} />

      {error ? (
        <div role="alert" className="mt-4 border border-accent/30 bg-accent/[0.06] p-5 text-center">
          <p className="text-xs text-accent">{error}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => setRetryRevision((current) => current + 1)} className="mt-3">
            <RotateCw className="h-3.5 w-3.5" /> Retry
          </Button>
        </div>
      ) : seasonDetails ? (
        <div className="mt-4 grid gap-2">
          {seasonDetails.episodes.map((episode) => {
            const selection = {
              seriesTmdbId: details.tmdbId,
              seasonNumber: episode.seasonNumber,
              episodeNumber: episode.episodeNumber,
            };
            const still = episode.stillPath ? tmdbImageUrl(episode.stillPath, "w300") : null;
            return (
              <button
                key={episode.tmdbId}
                type="button"
                onClick={() => onSelectEpisode(selection)}
                onPointerEnter={() => prefetchEpisodeDetails(selection)}
                onFocus={() => prefetchEpisodeDetails(selection)}
                className="group grid min-w-0 grid-cols-[5.75rem_minmax(0,1fr)_auto] items-center gap-3 border border-border bg-background/35 p-2 text-left transition-[border-color,background-color,transform] hover:-translate-y-px hover:border-accent/30 hover:bg-white/[0.035] sm:grid-cols-[8.5rem_minmax(0,1fr)_auto] sm:gap-4 [content-visibility:auto] [contain-intrinsic-size:0_7rem]"
              >
                <div className="relative aspect-video overflow-hidden bg-bg-elevated">
                  {still ? (
                    <img
                      src={still}
                      alt=""
                      width={300}
                      height={169}
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                    />
                  ) : null}
                  <span className="absolute bottom-1.5 left-1.5 border border-white/15 bg-black/65 px-1.5 py-0.5 text-[8px] text-white/80 backdrop-blur-sm">
                    E{String(episode.episodeNumber).padStart(2, "0")}
                  </span>
                </div>
                <div className="min-w-0 py-1">
                  <h3 className="truncate text-[11px] font-semibold text-foreground transition-colors group-hover:text-accent sm:text-xs">{episode.name}</h3>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[9px] text-muted-foreground">
                    {episode.airDate ? (
                      <span className="inline-flex items-center gap-1">
                        <CalendarDays className="h-3 w-3" /> {formatDate(episode.airDate)}
                      </span>
                    ) : null}
                    {episode.runtime ? (
                      <span className="inline-flex items-center gap-1">
                        <Clock3 className="h-3 w-3" /> {formatRuntime(episode.runtime)}
                      </span>
                    ) : null}
                    {episode.voteAverage > 0 ? (
                      <span className="inline-flex items-center gap-1 text-amber-300">
                        <Star className="h-3 w-3 fill-current" /> {episode.voteAverage.toFixed(1)} <span className="text-text-dim">({episode.voteCount})</span>
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 line-clamp-2 text-[9px] leading-relaxed text-foreground/55 sm:text-[10px]">{episode.overview || "No episode description is available yet."}</p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-text-dim transition-[color,transform] group-hover:translate-x-0.5 group-hover:text-accent" />
              </button>
            );
          })}
          {!seasonDetails.episodes.length ? (
            <div className="border border-border p-6 text-center text-xs text-muted-foreground">No episodes are listed for this season.</div>
          ) : null}
        </div>
      ) : (
        <div
          role="status"
          className="mt-4 flex min-h-40 items-center justify-center gap-2 border border-border bg-background/25 text-[10px] uppercase tracking-[0.13em] text-muted-foreground"
        >
          <Loader2 className="h-4 w-4 animate-spin text-accent" /> Loading season…
        </div>
      )}
    </section>
  );
}

function SeasonIntroduction({ season }: { season?: DiscoverSeasonSummary }) {
  if (!season) return null;
  return (
    <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2">
      <div>
        <h3 className="text-sm font-semibold">{season.name}</h3>
        {season.overview ? <p className="mt-2 max-w-3xl text-[10px] leading-relaxed text-foreground/60">{season.overview}</p> : null}
      </div>
      {season.airDate ? <span className="text-[9px] uppercase tracking-[0.12em] text-text-dim">First aired {formatDate(season.airDate)}</span> : null}
    </div>
  );
}

function orderSeasons(seasons: DiscoverSeasonSummary[]): DiscoverSeasonSummary[] {
  return [...seasons].sort((left, right) => {
    if (left.seasonNumber === 0) return 1;
    if (right.seasonNumber === 0) return -1;
    return left.seasonNumber - right.seasonNumber;
  });
}

function formatDate(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric" }).format(date);
}
