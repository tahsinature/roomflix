import { Clapperboard, Copy, ExternalLink, Shield, Star, Tv, UserRound } from "lucide-react";
import type { DiscoverTitleDetails } from "@shared/protocol";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/Toast";
import { backdropUrl, formatRuntime, formatVotes, posterUrl } from "./discover-utils";
import { certificationFor, parentsGuideUrl } from "./title-actions";
import { TitlePosterActions } from "./TitleActions";

export function TitleHero({ details }: { details: DiscoverTitleDetails }) {
  const backdrop = backdropUrl(details.backdropPath);
  const poster = posterUrl(details.posterPath, "w342");
  const MediaIcon = details.mediaType === "tv" ? Tv : Clapperboard;
  return (
    <div className="relative overflow-hidden border-b border-border">
      <div className="absolute inset-0">
        {backdrop ? <img src={backdrop} alt="" className="h-full w-full object-cover opacity-30" /> : null}
        <div className="absolute inset-0 bg-gradient-to-r from-card via-card/90 to-card/55" />
        <div className="absolute inset-0 bg-gradient-to-t from-card via-transparent to-black/30" />
      </div>
      <div className="relative flex min-w-0 gap-4 p-5 sm:gap-6 sm:p-7">
        <div className="w-28 shrink-0 sm:w-36">
          <div className="aspect-[2/3] overflow-hidden border border-white/10 bg-bg-elevated shadow-2xl">
            {poster ? <img src={poster} alt={details.title} className="h-full w-full object-cover" /> : null}
          </div>
          <TitlePosterActions details={details} />
        </div>
        <div className="min-w-0 self-end pb-1">
          <span className="inline-flex items-center gap-1.5 border border-accent/35 bg-accent/10 px-2 py-1 text-[9px] uppercase tracking-[0.14em] text-accent">
            <MediaIcon className="h-3 w-3" />
            {details.mediaType === "tv" ? "Series" : "Film"}
          </span>
          <h2 className="mt-3 text-balance text-xl font-bold leading-tight sm:text-3xl">
            {details.title} {details.year ? <span className="text-base font-normal text-muted-foreground">({details.year})</span> : null}
          </h2>
          {details.tagline ? <p className="mt-2 max-w-xl text-xs italic text-muted-foreground">“{details.tagline}”</p> : null}
          <div className="mt-3 flex flex-wrap items-center gap-3 text-[10px]">
            <span className="flex items-center gap-1 text-amber-300">
              <Star className="h-3.5 w-3.5 fill-current" />
              {details.voteAverage.toFixed(1)}
            </span>
            <span className="text-cyan">{formatVotes(details.voteCount)} votes</span>
            <span className="text-muted-foreground">{formatRuntime(details.runtime)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function TitleFacts({ details, onSelectPerson }: { details: DiscoverTitleDetails; onSelectPerson: (tmdbId: number) => void }) {
  const toast = useToast();
  const certification = certificationFor(details);
  return (
    <section>
      <SectionLabel>Details</SectionLabel>
      <div className="mt-3 border border-border bg-background/35">
        <FactRow label="Description">
          <div className="flex items-start gap-2">
            <p className="max-w-2xl flex-1 text-xs leading-relaxed text-foreground/80">{details.overview || "No description available."}</p>
            {details.overview ? (
              <button
                type="button"
                aria-label="Copy description"
                title="Copy description"
                onClick={() => void navigator.clipboard.writeText(details.overview).then(() => toast.success("Description copied."))}
                className="shrink-0 p-1 text-muted-foreground hover:text-accent"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
        </FactRow>
        <FactRow label="Release">
          <div className="flex flex-wrap items-center gap-2">
            <span>{details.releaseDate || "Date unknown"}</span>
            {details.status ? <span className="border border-border px-2 py-0.5 text-[9px] uppercase tracking-[0.12em] text-muted-foreground">{details.status}</span> : null}
          </div>
        </FactRow>
        <FactRow label="Runtime">
          <span>{formatRuntime(details.runtime)}</span>
        </FactRow>
        {details.mediaType === "tv" ? (
          <FactRow label="Series">
            <span>
              {details.numberOfSeasons ?? "?"} seasons · {details.numberOfEpisodes ?? "?"} episodes
            </span>
          </FactRow>
        ) : null}
        <FactRow label="Language">
          <LanguageTags languages={details.spokenLanguages} />
        </FactRow>
        <FactRow label="Genres">
          <GenreTags genres={details.genres} />
        </FactRow>
        {certification || details.adult || details.imdbId ? (
          <FactRow label="Age rating">
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn("inline-flex items-center gap-1.5 border px-2 py-1 text-[10px]", details.adult ? "border-accent/40 bg-accent/10 text-accent" : "border-amber-400/35 bg-amber-400/10 text-amber-300")}>
                <Shield className="h-3.5 w-3.5" />
                {details.adult ? "Adult" : (certification?.value ?? "Not rated")}
              </span>
              {certification ? <span className="text-[10px] text-muted-foreground">{certification.region}</span> : null}
              {details.imdbId ? (
                <a href={parentsGuideUrl(details.imdbId)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[10px] text-accent hover:text-foreground">
                  Check IMDb Parents Guide <ExternalLink className="h-3 w-3" />
                </a>
              ) : null}
            </div>
          </FactRow>
        ) : null}
        {details.directors.length ? (
          <FactRow label={details.mediaType === "movie" ? "Director" : "Created by"}>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {details.directors.map((person) => (
                <button
                  key={person.tmdbId}
                  type="button"
                  onClick={() => onSelectPerson(person.tmdbId)}
                  className="text-xs text-foreground underline decoration-border underline-offset-4 hover:text-accent"
                >
                  {person.name}
                </button>
              ))}
            </div>
          </FactRow>
        ) : null}
      </div>
    </section>
  );
}

export function TitleCast({ details, onSelectPerson }: { details: DiscoverTitleDetails; onSelectPerson: (tmdbId: number) => void }) {
  if (!details.cast.length) return null;
  return (
    <section>
      <SectionLabel>Cast</SectionLabel>
      <div className="mt-3 flex gap-3 overflow-x-auto pb-2">
        {details.cast.map((person) => {
          const image = posterUrl(person.profilePath, "w185");
          return (
            <button key={person.tmdbId} type="button" onClick={() => onSelectPerson(person.tmdbId)} className="group w-24 shrink-0 text-left">
              <div className="aspect-[4/5] overflow-hidden border border-border bg-bg-elevated group-hover:border-accent/40">
                {image ? (
                  <img src={image} alt="" loading="lazy" className="h-full w-full object-cover grayscale transition group-hover:grayscale-0" />
                ) : (
                  <div className="grid h-full place-items-center">
                    <UserRound className="h-6 w-6 text-text-dim" />
                  </div>
                )}
              </div>
              <p className="mt-1.5 line-clamp-2 text-[10px] font-semibold leading-tight">{person.name}</p>
              <p className="mt-0.5 line-clamp-1 text-[9px] text-text-dim">{person.character}</p>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return <h3 className="section-label">{children}</h3>;
}

function FactRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2 border-b border-border px-3 py-3 last:border-b-0 sm:grid-cols-[8rem_1fr]">
      <span className="text-[9px] uppercase tracking-[0.15em] text-muted-foreground">{label}</span>
      <div className="min-w-0 text-xs">{children}</div>
    </div>
  );
}

function GenreTags({ genres }: { genres: string[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {genres.map((genre, index) => (
        <span
          key={genre}
          className={cn(
            "border px-2 py-1 text-[10px]",
            index % 3 === 0
              ? "border-accent/35 bg-accent/10 text-accent"
              : index % 3 === 1
                ? "border-cyan/30 bg-cyan/10 text-cyan"
                : "border-amber-400/30 bg-amber-400/10 text-amber-300",
          )}
        >
          ◆ {genre}
        </span>
      ))}
    </div>
  );
}

function LanguageTags({ languages }: { languages: string[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {languages.length ? (
        languages.map((language) => (
          <span key={language} className="border border-border-hover bg-white/[0.03] px-2 py-1 text-[10px] text-foreground">
            ◎ {language}
          </span>
        ))
      ) : (
        <span className="text-muted-foreground">Unknown</span>
      )}
    </div>
  );
}
