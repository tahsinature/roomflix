import { useEffect, useState } from "react";
import { CalendarDays, Clapperboard, Clock3, Copy, ExternalLink, Loader2, RotateCw, Star, Tv, UserRound } from "lucide-react";
import type { DiscoverEpisodeDetails, DiscoverPersonCredit, DiscoverTitleDetails } from "@shared/protocol";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/Toast";
import { DiscoverDetailHeader } from "./DiscoverDetailHeader";
import { invalidateEpisodeDetails, loadEpisodeDetails } from "./episode-cache";
import { formatRuntime, posterUrl, tmdbImageUrl, type EpisodeSelection } from "./discover-utils";
import { loadTitleDetails } from "./title-details-cache";
import { SectionLabel } from "./TitleDetailSections";

export function DiscoverEpisodeView({
  selection,
  onBack,
  onOpenSeries,
  onSelectPerson,
}: {
  selection: EpisodeSelection;
  onBack: () => void;
  onOpenSeries: () => void;
  onSelectPerson: (tmdbId: number) => void;
}) {
  const [episode, setEpisode] = useState<DiscoverEpisodeDetails | null>(null);
  const [series, setSeries] = useState<DiscoverTitleDetails | null>(null);
  const [error, setError] = useState("");
  const [retryRevision, setRetryRevision] = useState(0);
  const identity = `${selection.seriesTmdbId}:${selection.seasonNumber}:${selection.episodeNumber}`;

  useEffect(() => {
    let cancelled = false;
    setEpisode(null);
    setSeries(null);
    setError("");
    void Promise.all([loadEpisodeDetails(selection), loadTitleDetails({ mediaType: "tv", tmdbId: selection.seriesTmdbId })])
      .then(([episodeDetails, seriesDetails]) => {
        if (cancelled) return;
        setEpisode(episodeDetails);
        setSeries(seriesDetails);
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "This episode is unavailable.");
      });
    return () => {
      cancelled = true;
    };
  }, [identity, retryRevision, selection]);

  const retry = () => {
    invalidateEpisodeDetails(selection);
    setRetryRevision((current) => current + 1);
  };

  return (
    <main className="min-h-full pb-12">
      <DiscoverDetailHeader label={episode?.name ?? `Season ${selection.seasonNumber}, Episode ${selection.episodeNumber}`} onBack={onBack} />
      <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-7">
        {error ? (
          <div role="alert" className="grid min-h-72 place-items-center border border-accent/30 bg-accent/[0.06] p-6 text-center">
            <div>
              <p className="text-sm text-accent">{error}</p>
              <Button type="button" variant="outline" size="sm" onClick={retry} className="mt-4">
                <RotateCw className="h-3.5 w-3.5" /> Retry
              </Button>
            </div>
          </div>
        ) : episode && series ? (
          <article className="view-enter overflow-hidden rounded-2xl border border-white/[0.08] bg-card/25 shadow-[0_28px_80px_-45px_rgba(0,0,0,0.95)]">
            <EpisodeHero episode={episode} series={series} onOpenSeries={onOpenSeries} />
            <div className="grid min-w-0 gap-7 px-4 py-6 sm:px-6 sm:py-8 lg:grid-cols-[minmax(0,1fr)_15rem]">
              <div className="min-w-0 space-y-8">
                <EpisodeFacts episode={episode} />
                <EpisodeCrew episode={episode} onSelectPerson={onSelectPerson} />
                <EpisodeCast episode={episode} onSelectPerson={onSelectPerson} />
              </div>
              <aside className="self-start border border-border bg-background/35 p-4 lg:sticky lg:top-[5.75rem]">
                <p className="text-[9px] uppercase tracking-[0.15em] text-muted-foreground">Series context</p>
                <p className="mt-2 text-sm font-semibold">{series.title}</p>
                <p className="mt-1 text-[10px] text-text-dim">
                  {episodeCode(episode)} · {series.year || "Year unknown"}
                </p>
                <Button type="button" variant="outline" size="sm" onClick={onOpenSeries} className="mt-4 w-full">
                  <Tv className="h-3.5 w-3.5" /> View series
                </Button>
              </aside>
            </div>
          </article>
        ) : (
          <div role="status" className="grid min-h-80 place-items-center border border-border bg-card/35">
            <span className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.13em] text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-accent" /> Loading episode…
            </span>
          </div>
        )}
      </div>
    </main>
  );
}

function EpisodeHero({ episode, series, onOpenSeries }: { episode: DiscoverEpisodeDetails; series: DiscoverTitleDetails; onOpenSeries: () => void }) {
  const still = episode.stillPath ? tmdbImageUrl(episode.stillPath, "original") : null;
  const poster = posterUrl(series.seasons.find((season) => season.seasonNumber === episode.seasonNumber)?.posterPath ?? series.posterPath, "w342");
  return (
    <header className="relative isolate min-h-[22rem] overflow-hidden border-b border-white/[0.07] sm:min-h-[26rem]">
      <div className="absolute inset-0">
        {still ? <img src={still} alt="" width={1280} height={720} fetchPriority="high" decoding="async" className="h-full w-full scale-[1.02] object-cover opacity-45" /> : null}
        <div className="absolute inset-0 bg-gradient-to-r from-card via-card/85 to-card/30" />
        <div className="absolute inset-0 bg-gradient-to-t from-card via-card/15 to-black/45" />
      </div>
      <div className="absolute -left-16 bottom-0 h-52 w-52 rounded-full bg-cyan/[0.07] blur-3xl" aria-hidden="true" />
      <div className="relative flex min-h-[22rem] items-end gap-4 p-4 pt-16 sm:min-h-[26rem] sm:gap-7 sm:p-7 sm:pt-20">
        {poster ? (
          <img
            src={poster}
            alt=""
            width={342}
            height={513}
            className="hidden w-28 shrink-0 rounded-lg border border-white/15 object-cover shadow-[0_22px_55px_-22px_rgba(0,0,0,0.95)] sm:block"
          />
        ) : null}
        <div className="min-w-0 pb-1">
          <button
            type="button"
            onClick={onOpenSeries}
            className="inline-flex items-center gap-1.5 rounded-full border border-cyan/30 bg-cyan/10 px-2.5 py-1 text-[8px] uppercase tracking-[0.14em] text-cyan backdrop-blur-sm hover:border-cyan/50 hover:text-foreground sm:text-[9px]"
          >
            <Clapperboard className="h-3 w-3" /> {series.title} · {episodeCode(episode)}
          </button>
          <h1 className="mt-3 max-w-3xl text-balance text-2xl font-bold leading-[1.12] tracking-[-0.035em] sm:text-4xl">{episode.name}</h1>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-[9px] sm:text-[10px]">
            {episode.voteAverage > 0 ? (
              <span className="flex items-center gap-1 rounded-full border border-amber-300/15 bg-black/30 px-2 py-1 text-amber-300 backdrop-blur-sm">
                <Star className="h-3.5 w-3.5 fill-current" /> {episode.voteAverage.toFixed(1)} <span className="text-white/40">· {episode.voteCount} votes</span>
              </span>
            ) : null}
            {episode.airDate ? (
              <span className="rounded-full border border-white/[0.08] bg-black/30 px-2 py-1 text-muted-foreground backdrop-blur-sm">{formatDate(episode.airDate)}</span>
            ) : null}
            <span className="rounded-full border border-white/[0.08] bg-black/30 px-2 py-1 text-muted-foreground backdrop-blur-sm">{formatRuntime(episode.runtime)}</span>
          </div>
        </div>
      </div>
    </header>
  );
}

function EpisodeFacts({ episode }: { episode: DiscoverEpisodeDetails }) {
  const toast = useToast();
  return (
    <section>
      <SectionLabel>Episode details</SectionLabel>
      <div className="mt-3 border border-border bg-background/35">
        <Fact label="Description">
          <div className="flex min-w-0 items-start gap-2">
            <p className="min-w-0 flex-1 text-xs leading-relaxed text-foreground/80">{episode.overview || "No description is available for this episode."}</p>
            {episode.overview ? (
              <button
                type="button"
                aria-label="Copy description"
                title="Copy description"
                onClick={() => void navigator.clipboard.writeText(episode.overview).then(() => toast.success("Description copied."))}
                className="shrink-0 p-1 text-muted-foreground hover:text-accent"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
        </Fact>
        <Fact label="Aired">
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays className="h-3.5 w-3.5 text-cyan" /> {episode.airDate ? formatDate(episode.airDate) : "Date unknown"}
          </span>
        </Fact>
        <Fact label="Runtime">
          <span className="inline-flex items-center gap-1.5">
            <Clock3 className="h-3.5 w-3.5 text-cyan" /> {formatRuntime(episode.runtime)}
          </span>
        </Fact>
        {episode.productionCode ? <Fact label="Production code">{episode.productionCode}</Fact> : null}
        {episode.imdbId ? (
          <Fact label="IMDb">
            <a
              href={`https://www.imdb.com/title/${encodeURIComponent(episode.imdbId)}/`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-accent hover:text-foreground"
            >
              Open episode on IMDb <ExternalLink className="h-3 w-3" />
            </a>
          </Fact>
        ) : null}
      </div>
    </section>
  );
}

function EpisodeCrew({ episode, onSelectPerson }: { episode: DiscoverEpisodeDetails; onSelectPerson: (tmdbId: number) => void }) {
  if (!episode.directors.length && !episode.writers.length) return null;
  return (
    <section>
      <SectionLabel>Creative team</SectionLabel>
      <div className="mt-3 border border-border bg-background/35">
        {episode.directors.length ? <CreditRow label="Directed by" credits={episode.directors} onSelectPerson={onSelectPerson} /> : null}
        {episode.writers.length ? <CreditRow label="Written by" credits={episode.writers} onSelectPerson={onSelectPerson} /> : null}
      </div>
    </section>
  );
}

function CreditRow({ label, credits, onSelectPerson }: { label: string; credits: DiscoverPersonCredit[]; onSelectPerson: (tmdbId: number) => void }) {
  return (
    <div className="grid gap-2 border-b border-border px-3 py-3 last:border-b-0 sm:grid-cols-[8rem_minmax(0,1fr)]">
      <span className="text-[9px] uppercase tracking-[0.15em] text-muted-foreground">{label}</span>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {credits.map((person) => (
          <button
            key={person.tmdbId}
            type="button"
            onClick={() => onSelectPerson(person.tmdbId)}
            className="text-left text-xs font-medium underline decoration-border underline-offset-4 hover:text-accent"
          >
            {person.name}
          </button>
        ))}
      </div>
    </div>
  );
}

function EpisodeCast({ episode, onSelectPerson }: { episode: DiscoverEpisodeDetails; onSelectPerson: (tmdbId: number) => void }) {
  if (!episode.cast.length) return null;
  return (
    <section>
      <SectionLabel>Episode cast</SectionLabel>
      <div className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(6rem,1fr))] gap-3">
        {episode.cast.map((person) => {
          const image = posterUrl(person.profilePath, "w185");
          return (
            <button key={person.tmdbId} type="button" onClick={() => onSelectPerson(person.tmdbId)} className="group min-w-0 text-left">
              <span className="block aspect-[4/5] overflow-hidden border border-border bg-bg-elevated transition-colors group-hover:border-accent/40">
                {image ? (
                  <img
                    src={image}
                    alt=""
                    width={185}
                    height={278}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover grayscale transition-[filter,transform] duration-200 group-hover:scale-[1.02] group-hover:grayscale-0"
                  />
                ) : (
                  <span className="grid h-full place-items-center">
                    <UserRound className="h-6 w-6 text-text-dim" />
                  </span>
                )}
              </span>
              <span className="mt-1.5 block line-clamp-2 text-[10px] font-semibold leading-tight group-hover:text-accent">{person.name}</span>
              <span className="mt-0.5 block truncate text-[9px] text-text-dim">{person.character}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid min-w-0 gap-2 border-b border-border px-3 py-3 last:border-b-0 sm:grid-cols-[8rem_minmax(0,1fr)]">
      <span className="text-[9px] uppercase tracking-[0.15em] text-muted-foreground">{label}</span>
      <div className="min-w-0 break-words text-xs">{children}</div>
    </div>
  );
}

function episodeCode(episode: Pick<DiscoverEpisodeDetails, "seasonNumber" | "episodeNumber">): string {
  return `S${String(episode.seasonNumber).padStart(2, "0")} E${String(episode.episodeNumber).padStart(2, "0")}`;
}

function formatDate(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(undefined, { year: "numeric", month: "long", day: "numeric" }).format(date);
}
