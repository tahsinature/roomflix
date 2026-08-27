import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, RotateCw } from "lucide-react";
import type { DiscoverImageKind, DiscoverTitleDetails, TitleLibraryItem } from "@shared/protocol";
import { Button } from "@/components/ui/button";
import { useCommandPalette } from "@/features/command-palette/CommandPaletteProvider";
import { DiscoverDetailHeader } from "./DiscoverDetailHeader";
import { TitleDetailWorkspace } from "./TitleDetailWorkspace";
import { TitleHero } from "./TitleDetailSections";
import { backdropUrl, posterUrl, titleIdentity, type TitleSelection } from "./discover-utils";
import { invalidateTitleDetails, loadTitleDetails } from "./title-details-cache";

type LibraryPayload = Omit<TitleLibraryItem, "id" | "userId" | "addedAt" | "updatedAt">;

export function DiscoverTitleView({
  selection,
  library,
  onBack,
  onSelectTitle,
  onSelectPerson,
  onOpenGallery,
  onOpenPersonGallery,
  onViewed,
  onSave,
  onRemove,
}: {
  selection: TitleSelection;
  library: TitleLibraryItem[];
  onBack: () => void;
  onSelectTitle: (selection: TitleSelection) => void;
  onSelectPerson: (tmdbId: number) => void;
  onOpenGallery: (kind: DiscoverImageKind) => void;
  onOpenPersonGallery: (tmdbId: number) => void;
  onViewed: (details: DiscoverTitleDetails) => void;
  onSave: (item: LibraryPayload) => Promise<void>;
  onRemove: (mediaType: TitleSelection["mediaType"], tmdbId: number) => Promise<void>;
}) {
  const [details, setDetails] = useState<DiscoverTitleDetails | null>(null);
  const [error, setError] = useState("");
  const [retryRevision, setRetryRevision] = useState(0);
  const { setCurrentTitle } = useCommandPalette();
  const identity = titleIdentity(selection);
  const viewedIdentity = useRef("");
  const existing = useMemo(() => library.find((item) => titleIdentity(item) === identity), [identity, library]);

  useEffect(() => {
    let cancelled = false;
    setDetails(null);
    setError("");
    void loadTitleDetails(selection)
      .then((value) => {
        if (!cancelled) setDetails(value);
      })
      .catch((reason) => {
        if (!cancelled) setError((reason as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [identity, retryRevision, selection]);

  useEffect(() => {
    setCurrentTitle(details);
    return () => setCurrentTitle(null);
  }, [details, setCurrentTitle]);

  useEffect(() => {
    if (!details || viewedIdentity.current === identity) return;
    viewedIdentity.current = identity;
    onViewed(details);
  }, [details, identity, onViewed]);

  const retry = () => {
    invalidateTitleDetails(selection);
    setRetryRevision((current) => current + 1);
  };

  return (
    <main className="min-h-full pb-12">
      <DiscoverDetailHeader label={details?.title ?? selection.title ?? "Title details"} onBack={onBack} />

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
        ) : details ? (
          <div className="view-enter overflow-hidden rounded-2xl border border-white/[0.08] bg-card/25 shadow-[0_28px_80px_-45px_rgba(0,0,0,0.95)]">
            <TitleHero details={details} onOpenGallery={onOpenGallery} />
            <div className="px-4 py-5 sm:px-6 sm:py-7">
              <TitleDetailWorkspace
                key={identity}
                details={details}
                library={library}
                existing={existing}
                onSelectTitle={onSelectTitle}
                onSelectPerson={onSelectPerson}
                onOpenPersonGallery={onOpenPersonGallery}
                onSave={onSave}
                onRemove={onRemove}
              />
            </div>
          </div>
        ) : (
          <TitleLoadingPreview selection={selection} />
        )}
      </div>
    </main>
  );
}

function TitleLoadingPreview({ selection }: { selection: TitleSelection }) {
  const backdrop = backdropUrl(selection.backdropPath ?? null);
  const poster = posterUrl(selection.posterPath ?? null, "w342");
  return (
    <section className="view-enter relative min-h-80 overflow-hidden border border-border bg-card/45">
      {backdrop ? (
        <div className="absolute inset-0">
          <img src={backdrop} alt="" width={1280} height={720} decoding="async" className="h-full w-full object-cover opacity-20" />
          <div className="absolute inset-0 bg-gradient-to-r from-card via-card/95 to-card/70" />
        </div>
      ) : null}
      <div className="relative flex min-h-80 items-center gap-5 p-5 sm:p-7">
        {poster ? <img src={poster} alt="" width={342} height={513} decoding="async" className="w-28 border border-white/10 object-cover sm:w-36" /> : null}
        <div className="min-w-0">
          <p className="text-[9px] uppercase tracking-[0.15em] text-accent">{selection.mediaType === "tv" ? "Series" : "Film"}</p>
          <h1 className="mt-2 text-balance text-2xl font-bold sm:text-4xl">{selection.title ?? "Loading title…"}</h1>
          {selection.year ? <p className="mt-2 text-xs text-muted-foreground">{selection.year}</p> : null}
          {selection.overview ? <p className="mt-4 line-clamp-3 max-w-2xl text-xs leading-relaxed text-foreground/70">{selection.overview}</p> : null}
          <span role="status" className="mt-5 inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.13em] text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" /> Loading details…
          </span>
        </div>
      </div>
    </section>
  );
}
