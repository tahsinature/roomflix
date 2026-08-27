import { Clapperboard, Copy, ExternalLink, Images, Shield, Star, Tv, UserRound } from "lucide-react";
import type { DiscoverImageKind, DiscoverTitleDetails } from "@shared/protocol";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/Toast";
import { backdropUrl, formatRuntime, formatVotes, posterUrl } from "./discover-utils";
import { prefetchPersonDetails } from "./person-details-cache";
import { prefetchImageGallery } from "./image-gallery-cache";
import { certificationFor, parentsGuideUrl } from "./title-actions";
import { TitlePosterActions } from "./TitleActions";
import { CopyableTitle } from "./CopyableTitle";

export function TitleHero({ details, onOpenGallery }: { details: DiscoverTitleDetails; onOpenGallery: (kind: DiscoverImageKind) => void }) {
  const backdrop = backdropUrl(details.backdropPath);
  const poster = posterUrl(details.posterPath, "w342");
  const MediaIcon = details.mediaType === "tv" ? Tv : Clapperboard;
  const gallerySubject = { type: details.mediaType, tmdbId: details.tmdbId } as const;
  const preferredGalleryKind: DiscoverImageKind = details.backdropPath ? "backdrop" : "poster";
  return (
    <div className="relative isolate overflow-hidden border-b border-white/[0.07]">
      <div className="absolute inset-0">
        {backdrop ? (
          <img src={backdrop} alt="" width={1280} height={720} fetchPriority="high" decoding="async" className="h-full w-full scale-[1.02] object-cover opacity-40" />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-r from-card via-card/85 to-card/35" />
        <div className="absolute inset-0 bg-gradient-to-t from-card via-card/15 to-black/40" />
      </div>
      <div className="absolute -left-20 bottom-0 h-48 w-48 rounded-full bg-accent/[0.09] blur-3xl" aria-hidden="true" />
      {backdrop || poster ? (
        <button
          type="button"
          onClick={() => onOpenGallery(preferredGalleryKind)}
          onPointerEnter={() => prefetchImageGallery(gallerySubject)}
          onFocus={() => prefetchImageGallery(gallerySubject)}
          className="absolute right-4 top-4 z-20 inline-flex h-9 items-center gap-2 rounded-full border border-white/15 bg-black/45 px-3 text-[9px] uppercase tracking-[0.12em] text-white/70 shadow-lg backdrop-blur-md transition-[color,border-color,background-color] hover:border-white/30 hover:bg-black/60 hover:text-white sm:right-6 sm:top-6"
        >
          <Images className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Photos</span>
        </button>
      ) : null}
      <div className="relative grid min-w-0 grid-cols-[6.25rem_minmax(0,1fr)] items-end gap-4 p-4 pt-16 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-7 sm:p-7 sm:pt-20">
        <div className="w-[6.25rem] shrink-0 sm:w-36">
          <button
            type="button"
            disabled={!poster}
            onClick={() => onOpenGallery("poster")}
            onPointerEnter={() => prefetchImageGallery(gallerySubject)}
            onFocus={() => prefetchImageGallery(gallerySubject)}
            aria-label={`View ${details.title} photos`}
            className="group relative block aspect-[2/3] w-full overflow-hidden rounded-lg border border-white/15 bg-bg-elevated text-left shadow-[0_22px_55px_-22px_rgba(0,0,0,0.95)] disabled:cursor-default sm:rounded-xl"
          >
            {poster ? (
              <>
                <img
                  src={poster}
                  alt={`${details.title} poster`}
                  width={342}
                  height={513}
                  fetchPriority="high"
                  decoding="async"
                  className="h-full w-full object-cover transition-[filter,transform] duration-300 group-hover:scale-[1.02] group-hover:brightness-75"
                />
                <span className="absolute inset-x-2 bottom-2 hidden translate-y-1 items-center justify-center gap-1.5 rounded-md border border-white/15 bg-black/55 px-2 py-1.5 text-[8px] uppercase tracking-[0.12em] text-white opacity-0 backdrop-blur-sm transition-[opacity,transform] group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100 sm:flex">
                  <Images className="h-3 w-3" /> View photos
                </span>
              </>
            ) : null}
          </button>
          <TitlePosterActions details={details} />
        </div>
        <div className="min-w-0 self-end pb-0.5 sm:pb-1">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-2.5 py-1 text-[8px] uppercase tracking-[0.14em] text-accent shadow-[0_0_22px_-10px_hsl(var(--accent)/0.8)] sm:text-[9px]">
            <MediaIcon className="h-3 w-3" />
            {details.mediaType === "tv" ? "Series" : "Film"}
          </span>
          <h1 className="mt-2.5 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xl font-bold leading-[1.16] tracking-[-0.035em] text-balance sm:mt-3 sm:gap-x-3 sm:text-4xl">
            <CopyableTitle title={details.title} />
            {details.year ? <span className="text-sm font-normal tracking-normal text-muted-foreground sm:text-base">({details.year})</span> : null}
          </h1>
          {details.tagline ? <p className="mt-2 line-clamp-2 max-w-xl text-[10px] italic leading-relaxed text-muted-foreground sm:text-xs">“{details.tagline}”</p> : null}
          <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[9px] sm:gap-2 sm:text-[10px]">
            <span className="flex items-center gap-1 rounded-full border border-amber-300/15 bg-black/25 px-2 py-1 text-amber-300 backdrop-blur-sm">
              <Star className="h-3.5 w-3.5 fill-current" />
              {details.voteAverage.toFixed(1)}
            </span>
            <span className="rounded-full border border-white/[0.08] bg-black/25 px-2 py-1 text-cyan backdrop-blur-sm">{formatVotes(details.voteCount)} votes</span>
            <span className="rounded-full border border-white/[0.08] bg-black/25 px-2 py-1 text-muted-foreground backdrop-blur-sm">{formatRuntime(details.runtime)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function TitleFacts({ details }: { details: DiscoverTitleDetails }) {
  const toast = useToast();
  const certification = certificationFor(details);
  return (
    <section className="min-w-0">
      <SectionLabel>Details</SectionLabel>
      <div className="mt-3 border border-border bg-background/35">
        <FactRow label="Description">
          <div className="flex min-w-0 items-start gap-2">
            <p className="min-w-0 flex-1 text-xs leading-relaxed text-foreground/80 [overflow-wrap:anywhere]">{details.overview || "No description available."}</p>
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
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 border px-2 py-1 text-[10px]",
                  details.adult ? "border-accent/40 bg-accent/10 text-accent" : "border-amber-400/35 bg-amber-400/10 text-amber-300",
                )}
              >
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
      </div>
    </section>
  );
}

export function TitleCastAndCrew({
  details,
  onSelectPerson,
  onOpenPersonGallery,
}: {
  details: DiscoverTitleDetails;
  onSelectPerson: (tmdbId: number) => void;
  onOpenPersonGallery: (tmdbId: number) => void;
}) {
  if (!details.directors.length && !details.cast.length) return null;

  const creatorLabel = details.mediaType === "movie" ? "Directed by" : "Created by";

  return (
    <section>
      <SectionLabel>Cast &amp; Crew</SectionLabel>
      {details.directors.length ? (
        <div className="mt-3 flex flex-col gap-2 border border-border bg-background/35 px-3 py-3 sm:flex-row sm:items-center sm:gap-6">
          <span className="shrink-0 text-[9px] uppercase tracking-[0.15em] text-muted-foreground">{creatorLabel}</span>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {details.directors.map((person) => (
              <button
                key={person.tmdbId}
                type="button"
                onClick={() => onSelectPerson(person.tmdbId)}
                onPointerEnter={() => prefetchPersonDetails(person.tmdbId)}
                onFocus={() => prefetchPersonDetails(person.tmdbId)}
                className="text-left text-xs font-medium text-foreground underline decoration-border underline-offset-4 transition-colors hover:text-accent"
              >
                {person.name}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {details.cast.length ? (
        <div className={details.directors.length ? "mt-6" : "mt-3"}>
          {details.directors.length ? <h3 className="text-[9px] uppercase tracking-[0.15em] text-muted-foreground">Cast</h3> : null}
          <div className={cn("grid grid-cols-[repeat(auto-fill,minmax(6rem,1fr))] gap-3", details.directors.length && "mt-3")}>
            {details.cast.map((person) => {
              const image = posterUrl(person.profilePath, "w185");
              return (
                <article key={person.tmdbId} className="group min-w-0">
                  <button
                    type="button"
                    onClick={() => onOpenPersonGallery(person.tmdbId)}
                    onPointerEnter={() => prefetchImageGallery({ type: "person", tmdbId: person.tmdbId })}
                    onFocus={() => prefetchImageGallery({ type: "person", tmdbId: person.tmdbId })}
                    aria-label={`View photos of ${person.name}`}
                    className="relative block aspect-[4/5] w-full overflow-hidden border border-border bg-bg-elevated text-left group-hover:border-accent/40"
                  >
                    {image ? (
                      <img
                        src={image}
                        alt=""
                        width={185}
                        height={278}
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full object-cover grayscale transition-[filter] duration-200 group-hover:grayscale-0"
                      />
                    ) : (
                      <div className="grid h-full place-items-center">
                        <UserRound className="h-6 w-6 text-text-dim" />
                      </div>
                    )}
                    <span className="absolute bottom-1.5 right-1.5 grid h-6 w-6 place-items-center border border-white/15 bg-black/55 text-white/65 opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                      <Images className="h-3 w-3" />
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onSelectPerson(person.tmdbId)}
                    onPointerEnter={() => prefetchPersonDetails(person.tmdbId)}
                    onFocus={() => prefetchPersonDetails(person.tmdbId)}
                    className="mt-1.5 line-clamp-2 text-left text-[10px] font-semibold leading-tight hover:text-accent"
                  >
                    {person.name}
                  </button>
                  <p className="mt-0.5 line-clamp-1 text-[9px] text-text-dim">{person.character}</p>
                </article>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return <h2 className="section-label">{children}</h2>;
}

function FactRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid min-w-0 gap-2 border-b border-border px-3 py-3 last:border-b-0 sm:grid-cols-[8rem_minmax(0,1fr)]">
      <span className="text-[9px] uppercase tracking-[0.15em] text-muted-foreground">{label}</span>
      <div className="min-w-0 break-words text-xs">{children}</div>
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
