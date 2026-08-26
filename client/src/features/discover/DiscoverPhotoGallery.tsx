import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, ImageOff, Loader2, Maximize2, Minimize2, Pause, Play, RotateCw } from "lucide-react";
import type { DiscoverImage, DiscoverImageGallery, DiscoverImageKind } from "@shared/protocol";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { tmdbImageUrl } from "./discover-utils";
import { invalidateImageGallery, loadImageGallery, type GallerySubject } from "./image-gallery-cache";

const SLIDE_DURATION_MS = 4_500;
const GROUPS: Array<{ kind: DiscoverImageKind; label: string }> = [
  { kind: "profile", label: "Photos" },
  { kind: "backdrop", label: "Backdrops" },
  { kind: "poster", label: "Posters" },
];

export function DiscoverPhotoGallery({ subject, initialKind, onBack }: { subject: GallerySubject; initialKind?: DiscoverImageKind; onBack: () => void }) {
  const [gallery, setGallery] = useState<DiscoverImageGallery | null>(null);
  const [activeKind, setActiveKind] = useState<DiscoverImageKind>(initialKind ?? (subject.type === "person" ? "profile" : "backdrop"));
  const [activeIndex, setActiveIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [error, setError] = useState("");
  const [retryRevision, setRetryRevision] = useState(0);
  const galleryRef = useRef<HTMLElement>(null);
  const activeThumbnailRef = useRef<HTMLButtonElement>(null);
  const touchStartX = useRef<number | null>(null);
  const subjectIdentity = `${subject.type}:${subject.tmdbId}`;

  useEffect(() => {
    let cancelled = false;
    setGallery(null);
    setError("");
    setPlaying(false);
    setActiveIndex(0);
    void loadImageGallery(subject)
      .then((result) => {
        if (cancelled) return;
        setGallery(result);
        setActiveKind(selectInitialKind(result, initialKind));
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Photos are unavailable.");
      });
    return () => {
      cancelled = true;
    };
  }, [initialKind, retryRevision, subjectIdentity]);

  const groupedImages = useMemo(() => {
    const groups = new Map<DiscoverImageKind, DiscoverImage[]>();
    for (const group of GROUPS) groups.set(group.kind, []);
    for (const image of gallery?.images ?? []) groups.get(image.kind)?.push(image);
    return groups;
  }, [gallery]);
  const availableGroups = GROUPS.filter((group) => (groupedImages.get(group.kind)?.length ?? 0) > 0);
  const activeImages = groupedImages.get(activeKind) ?? [];
  const activeImage = activeImages[activeIndex] ?? null;

  const goTo = useCallback(
    (index: number) => {
      if (!activeImages.length) return;
      setActiveIndex((index + activeImages.length) % activeImages.length);
    },
    [activeImages.length],
  );
  const showPrevious = useCallback(() => goTo(activeIndex - 1), [activeIndex, goTo]);
  const showNext = useCallback(() => goTo(activeIndex + 1), [activeIndex, goTo]);

  useEffect(() => {
    if (!playing || activeImages.length < 2) return;
    const interval = window.setInterval(showNext, SLIDE_DURATION_MS);
    return () => window.clearInterval(interval);
  }, [activeImages.length, playing, showNext]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (document.fullscreenElement) void document.exitFullscreen();
        else onBack();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        showPrevious();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        showNext();
      } else if (event.key === " " && !(event.target instanceof HTMLButtonElement)) {
        event.preventDefault();
        setPlaying((current) => !current);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onBack, showNext, showPrevious]);

  useEffect(() => {
    const onFullscreenChange = () => setFullscreen(document.fullscreenElement === galleryRef.current);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  useEffect(() => {
    activeThumbnailRef.current?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "nearest",
      inline: "center",
    });
    if (activeImages.length < 2) return;
    const neighborPaths = [activeImages[(activeIndex + 1) % activeImages.length], activeImages[(activeIndex - 1 + activeImages.length) % activeImages.length]];
    for (const neighbor of neighborPaths) {
      const image = new Image();
      image.src = tmdbImageUrl(neighbor.filePath);
    }
  }, [activeImages, activeIndex]);

  const selectGroup = (kind: DiscoverImageKind) => {
    setActiveKind(kind);
    setActiveIndex(0);
    setPlaying(false);
  };

  const retry = () => {
    invalidateImageGallery(subject);
    setRetryRevision((current) => current + 1);
  };

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void galleryRef.current?.requestFullscreen();
  };

  const finishSwipe = (endX: number) => {
    const startX = touchStartX.current;
    touchStartX.current = null;
    if (startX === null || Math.abs(endX - startX) < 48) return;
    if (endX < startX) showNext();
    else showPrevious();
  };

  if (error) {
    return (
      <GalleryMessage icon={ImageOff} title="Photos unavailable" detail={error}>
        <Button type="button" variant="outline" size="sm" onClick={retry}>
          <RotateCw className="h-3.5 w-3.5" /> Retry
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onBack}>
          Back
        </Button>
      </GalleryMessage>
    );
  }

  if (!gallery) {
    return <GalleryMessage icon={Loader2} title="Preparing the gallery" detail="Loading high-resolution artwork…" spinning />;
  }

  if (!activeImage) {
    return (
      <GalleryMessage icon={ImageOff} title="No photos available" detail={`TMDB does not currently have additional imagery for ${gallery.subjectName}.`}>
        <Button type="button" variant="outline" size="sm" onClick={onBack}>
          Back to details
        </Button>
      </GalleryMessage>
    );
  }

  return (
    <main
      ref={galleryRef}
      className={cn("relative flex min-h-[32rem] flex-col overflow-hidden bg-[#050608]", fullscreen ? "h-[100dvh]" : "h-[calc(100dvh-60px)] sm:h-[calc(100dvh-68px)]")}
    >
      <header className="relative z-20 flex min-h-14 shrink-0 items-center gap-3 border-b border-white/10 bg-black/55 px-3 backdrop-blur-xl sm:px-5">
        <button
          type="button"
          onClick={onBack}
          className="grid h-10 w-10 shrink-0 place-items-center border border-white/10 text-white/65 transition-colors hover:border-white/25 hover:text-white"
          aria-label="Back to details"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[9px] uppercase tracking-[0.18em] text-accent">Photo archive</p>
          <h1 className="truncate text-sm font-semibold text-white sm:text-base">{gallery.subjectName}</h1>
        </div>
        <span className="hidden text-[10px] tabular-nums text-white/45 sm:inline" aria-live="polite">
          {activeIndex + 1} / {activeImages.length}
        </span>
        <button
          type="button"
          onClick={() => setPlaying((current) => !current)}
          disabled={activeImages.length < 2}
          className="grid h-10 w-10 place-items-center border border-white/10 text-white/65 transition-colors hover:border-white/25 hover:text-white disabled:opacity-30"
          aria-label={playing ? "Pause slideshow" : "Play slideshow"}
          title={playing ? "Pause slideshow" : "Play slideshow"}
        >
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </button>
        <button
          type="button"
          onClick={toggleFullscreen}
          className="hidden h-10 w-10 place-items-center border border-white/10 text-white/65 transition-colors hover:border-white/25 hover:text-white sm:grid"
          aria-label={fullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          title={fullscreen ? "Exit fullscreen" : "Enter fullscreen"}
        >
          {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </button>
      </header>

      <section
        className="relative min-h-0 flex-1 overflow-hidden"
        aria-label={`${gallery.subjectName} photo ${activeIndex + 1}`}
        onTouchStart={(event) => {
          touchStartX.current = event.changedTouches[0]?.clientX ?? null;
        }}
        onTouchEnd={(event) => finishSwipe(event.changedTouches[0]?.clientX ?? 0)}
      >
        <img
          src={tmdbImageUrl(activeImage.filePath)}
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute -inset-8 h-[calc(100%+4rem)] w-[calc(100%+4rem)] scale-110 object-cover opacity-20 blur-3xl"
        />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(5,6,8,0.3)_55%,rgba(5,6,8,0.9)_100%)]" />
        <img
          key={activeImage.filePath}
          src={tmdbImageUrl(activeImage.filePath)}
          alt={`${gallery.subjectName} — ${groupLabel(activeKind)} ${activeIndex + 1}`}
          decoding="async"
          fetchPriority="high"
          className="view-enter relative z-10 h-full w-full select-none object-contain px-2 py-3 sm:px-16 sm:py-5"
          draggable={false}
        />

        {activeImages.length > 1 ? (
          <>
            <GalleryArrow direction="previous" onClick={showPrevious} />
            <GalleryArrow direction="next" onClick={showNext} />
          </>
        ) : null}

        <div className="absolute bottom-3 left-3 z-20 border border-white/10 bg-black/55 px-2.5 py-1.5 text-[9px] text-white/55 backdrop-blur-md sm:bottom-5 sm:left-5">
          {activeImage.width && activeImage.height ? `${activeImage.width} × ${activeImage.height}` : groupLabel(activeKind)}
        </div>
        {playing ? <div key={`${activeKind}-${activeIndex}`} className="gallery-progress absolute bottom-0 left-0 z-30 h-px bg-accent" /> : null}
      </section>

      <footer className="relative z-20 shrink-0 border-t border-white/10 bg-black/70 px-3 pb-3 pt-2 backdrop-blur-xl sm:px-5 sm:pb-4">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-1" role="tablist" aria-label="Photo collection">
            {availableGroups.map((group) => (
              <button
                key={group.kind}
                type="button"
                role="tab"
                aria-selected={activeKind === group.kind}
                onClick={() => selectGroup(group.kind)}
                className={cn(
                  "border px-2.5 py-1.5 text-[9px] uppercase tracking-[0.12em] transition-colors",
                  activeKind === group.kind ? "border-accent/45 bg-accent/10 text-accent" : "border-transparent text-white/45 hover:text-white/80",
                )}
              >
                {group.label} · {groupedImages.get(group.kind)?.length ?? 0}
              </button>
            ))}
          </div>
          <span className="text-[9px] tabular-nums text-white/40 sm:hidden">
            {activeIndex + 1} / {activeImages.length}
          </span>
        </div>
        <div className="flex gap-2 overflow-x-auto overscroll-x-contain pb-1 [scrollbar-width:thin]">
          {activeImages.map((image, index) => (
            <button
              key={image.filePath}
              ref={index === activeIndex ? activeThumbnailRef : undefined}
              type="button"
              onClick={() => goTo(index)}
              aria-label={`Show ${groupLabel(activeKind).toLowerCase()} ${index + 1}`}
              aria-current={index === activeIndex ? "true" : undefined}
              className={cn(
                "h-14 w-14 shrink-0 overflow-hidden border bg-white/5 transition-[border-color,opacity] sm:h-16 sm:w-16",
                index === activeIndex ? "border-accent opacity-100" : "border-white/10 opacity-45 hover:opacity-90",
              )}
            >
              <img
                src={tmdbImageUrl(image.filePath, thumbnailSize(image.kind))}
                alt=""
                width={300}
                height={300}
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover"
              />
            </button>
          ))}
        </div>
      </footer>
    </main>
  );
}

function GalleryArrow({ direction, onClick }: { direction: "previous" | "next"; onClick: () => void }) {
  const previous = direction === "previous";
  const Icon = previous ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${previous ? "Previous" : "Next"} photo`}
      className={cn(
        "absolute top-1/2 z-20 grid h-12 w-10 -translate-y-1/2 place-items-center border border-white/10 bg-black/45 text-white/60 backdrop-blur-md transition-colors hover:border-white/25 hover:bg-black/65 hover:text-white sm:h-16 sm:w-12",
        previous ? "left-2 sm:left-5" : "right-2 sm:right-5",
      )}
    >
      <Icon className="h-5 w-5" />
    </button>
  );
}

function GalleryMessage({
  icon: Icon,
  title,
  detail,
  spinning = false,
  children,
}: {
  icon: typeof ImageOff;
  title: string;
  detail: string;
  spinning?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <main className="grid h-[calc(100dvh-60px)] min-h-[28rem] place-items-center px-6 sm:h-[calc(100dvh-68px)]">
      <div className="max-w-md text-center">
        <Icon className={cn("mx-auto h-8 w-8 text-accent", spinning && "animate-spin")} />
        <h1 className="mt-4 text-xl font-semibold">{title}</h1>
        <p className="mt-2 text-xs leading-6 text-muted-foreground">{detail}</p>
        {children ? <div className="mt-5 flex justify-center gap-2">{children}</div> : null}
      </div>
    </main>
  );
}

function selectInitialKind(gallery: DiscoverImageGallery, preferred: DiscoverImageKind | undefined): DiscoverImageKind {
  if (preferred && gallery.images.some((image) => image.kind === preferred)) return preferred;
  return GROUPS.find((group) => gallery.images.some((image) => image.kind === group.kind))?.kind ?? "profile";
}

function groupLabel(kind: DiscoverImageKind): string {
  return GROUPS.find((group) => group.kind === kind)?.label.replace(/s$/, "") ?? "Photo";
}

function thumbnailSize(kind: DiscoverImageKind): string {
  return kind === "backdrop" ? "w300" : "w185";
}
