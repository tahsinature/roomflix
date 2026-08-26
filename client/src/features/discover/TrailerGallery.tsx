import { useState } from "react";
import { ExternalLink, Play, Youtube } from "lucide-react";
import type { DiscoverTitleDetails, DiscoverTrailer } from "@shared/protocol";
import { cn } from "@/lib/utils";
import { SectionLabel } from "./TitleDetailSections";

export function TrailerGallery({ details }: { details: DiscoverTitleDetails }) {
  const trailers = details.trailers;
  const [selectedTrailerId, setSelectedTrailerId] = useState(trailers[0]?.id ?? "");
  const [playingTrailerId, setPlayingTrailerId] = useState<string | null>(null);
  const selectedTrailer = trailers.find((trailer) => trailer.id === selectedTrailerId) ?? trailers[0];

  if (!selectedTrailer) return null;

  const playTrailer = (trailer: DiscoverTrailer) => {
    setSelectedTrailerId(trailer.id);
    setPlayingTrailerId(trailer.id);
  };

  return (
    <section>
      <div className="flex items-end justify-between gap-3">
        <SectionLabel>Trailers</SectionLabel>
        <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-text-dim">
          {trailers.length} {trailers.length === 1 ? "video" : "videos"}
        </span>
      </div>

      <div className="mt-3 grid overflow-hidden border border-border bg-black/35 xl:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="min-w-0">
          <div className="relative aspect-video overflow-hidden bg-black">
            {playingTrailerId === selectedTrailer.id ? (
              <iframe
                key={selectedTrailer.id}
                src={youtubeEmbedUrl(selectedTrailer.youtubeKey)}
                title={selectedTrailer.name}
                className="absolute inset-0 h-full w-full border-0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
              />
            ) : (
              <TrailerPoster trailer={selectedTrailer} onPlay={() => playTrailer(selectedTrailer)} />
            )}
          </div>

          <div className="flex min-h-[4.5rem] items-center justify-between gap-4 border-t border-white/10 bg-[#111319] px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-foreground">{selectedTrailer.name}</p>
              <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                {selectedTrailer.type}
                {selectedTrailer.official ? " · Official" : ""}
              </p>
            </div>
            <a
              href={youtubeWatchUrl(selectedTrailer.youtubeKey)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex shrink-0 items-center gap-1.5 px-2 py-2 font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent/60"
            >
              Open on YouTube <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
          </div>
        </div>

        <aside className="border-t border-border bg-background/55 xl:border-l xl:border-t-0" aria-label="Trailer playlist">
          <div className="flex h-10 items-center justify-between border-b border-border px-3">
            <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">Select trailer</span>
            <Youtube className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
          </div>
          <div className="flex gap-2 overflow-x-auto overscroll-x-contain p-2 xl:max-h-[32rem] xl:flex-col xl:overflow-x-hidden xl:overflow-y-auto">
            {trailers.map((trailer, index) => (
              <TrailerChoice
                key={trailer.id}
                trailer={trailer}
                index={index}
                selected={trailer.id === selectedTrailer.id}
                onSelect={() => playTrailer(trailer)}
              />
            ))}
          </div>
        </aside>
      </div>
    </section>
  );
}

function TrailerPoster({ trailer, onPlay }: { trailer: DiscoverTrailer; onPlay: () => void }) {
  return (
    <button
      type="button"
      onClick={onPlay}
      aria-label={`Play ${trailer.name}`}
      className="group absolute inset-0 w-full overflow-hidden text-left focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/70"
    >
      <img
        src={youtubeThumbnailUrl(trailer.youtubeKey)}
        alt=""
        width={1280}
        height={720}
        decoding="async"
        className="h-full w-full object-cover opacity-65 transition-[transform,opacity] duration-300 group-hover:scale-[1.015] group-hover:opacity-80 motion-reduce:transition-none"
        onError={(event) => {
          const fallback = youtubeThumbnailUrl(trailer.youtubeKey, false);
          if (event.currentTarget.src !== fallback) event.currentTarget.src = fallback;
        }}
      />
      <span className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20" aria-hidden="true" />
      <span className="absolute inset-0 grid place-items-center">
        <span className="grid h-16 w-16 place-items-center border border-white/25 bg-black/70 text-accent shadow-[0_12px_40px_rgba(0,0,0,0.45)] backdrop-blur-md transition-[transform,background-color] duration-200 group-hover:scale-105 group-hover:bg-accent group-hover:text-white motion-reduce:transition-none">
          <Play className="ml-0.5 h-6 w-6 fill-current" aria-hidden="true" />
        </span>
      </span>
      <span className="absolute bottom-4 left-4 font-mono text-[9px] uppercase tracking-[0.16em] text-white/65">Play inside Roomflix</span>
    </button>
  );
}

function TrailerChoice({
  trailer,
  index,
  selected,
  onSelect,
}: {
  trailer: DiscoverTrailer;
  index: number;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "group flex w-[17rem] shrink-0 items-center gap-3 border p-2 text-left transition-[color,background-color,border-color] focus-visible:ring-2 focus-visible:ring-accent/60 xl:w-full",
        selected ? "border-accent/45 bg-accent/10 text-foreground" : "border-transparent text-muted-foreground hover:border-border hover:bg-white/[0.035] hover:text-foreground",
      )}
    >
      <span className="relative block aspect-video w-24 shrink-0 overflow-hidden bg-black">
        <img
          src={youtubeThumbnailUrl(trailer.youtubeKey, false)}
          alt=""
          width={480}
          height={360}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover opacity-65 transition-opacity group-hover:opacity-85"
        />
        <span className="absolute inset-0 grid place-items-center bg-black/10">
          <Play className="h-3.5 w-3.5 fill-white text-white" aria-hidden="true" />
        </span>
      </span>
      <span className="min-w-0">
        <span className="block font-mono text-[8px] uppercase tracking-[0.14em] text-text-dim">{String(index + 1).padStart(2, "0")}</span>
        <span className="mt-1 line-clamp-2 block text-[10px] font-medium leading-4">{trailer.name}</span>
        <span className="mt-1 block font-mono text-[8px] uppercase tracking-[0.12em] text-text-dim">{trailer.type}</span>
      </span>
    </button>
  );
}

function youtubeEmbedUrl(key: string): string {
  return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(key)}?autoplay=1&rel=0`;
}

function youtubeWatchUrl(key: string): string {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(key)}`;
}

function youtubeThumbnailUrl(key: string, highResolution = true): string {
  return `https://i.ytimg.com/vi/${encodeURIComponent(key)}/${highResolution ? "maxresdefault" : "hqdefault"}.jpg`;
}
