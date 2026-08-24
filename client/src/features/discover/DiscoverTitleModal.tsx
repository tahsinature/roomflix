import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import type { DiscoverTitleDetails, TitleLibraryItem } from "@shared/protocol";
import { Modal } from "@/components/Modal";
import { api } from "@/lib/api";
import { PulseLabPrototype } from "./PulseLabPrototype";
import { TitleGrid } from "./TitleGrid";
import { SectionLabel, TitleCast, TitleFacts, TitleHero } from "./TitleDetailSections";
import { TitleMediaSections } from "./TitleMediaSections";
import { TitleWatchState } from "./TitleWatchState";
import { titleIdentity, type TitleSelection } from "./discover-utils";

type LibraryPayload = Omit<TitleLibraryItem, "id" | "userId" | "addedAt" | "updatedAt">;

export function DiscoverTitleModal({
  selection,
  library,
  onClose,
  onSelectTitle,
  onSelectPerson,
  onSave,
  onRemove,
}: {
  selection: TitleSelection | null;
  library: TitleLibraryItem[];
  onClose: () => void;
  onSelectTitle: (selection: TitleSelection) => void;
  onSelectPerson: (tmdbId: number) => void;
  onSave: (item: LibraryPayload) => Promise<void>;
  onRemove: (mediaType: TitleSelection["mediaType"], tmdbId: number) => Promise<void>;
}) {
  const [details, setDetails] = useState<DiscoverTitleDetails | null>(null);
  const [error, setError] = useState("");
  const existing = useMemo(() => library.find((item) => selection && titleIdentity(item) === titleIdentity(selection)), [library, selection]);

  useEffect(() => {
    if (!selection) return;
    let cancelled = false;
    setDetails(null);
    setError("");
    void api
      .discoverTitle(selection.mediaType, selection.tmdbId)
      .then((value) => {
        if (!cancelled) setDetails(value);
      })
      .catch((reason) => {
        if (!cancelled) setError((reason as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [selection]);

  return (
    <Modal open={selection !== null} title={details?.title ?? selection?.title ?? "Title details"} onClose={onClose} className="max-w-6xl">
      {error ? <div className="border border-accent/30 bg-accent/10 p-4 text-sm text-accent">{error}</div> : null}
      {!error && !details ? (
        <div className="grid min-h-72 place-items-center text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin text-accent" />
        </div>
      ) : null}
      {details ? (
        <div className="-m-5">
          <TitleHero details={details} />
          <div className="mx-auto flex max-w-4xl flex-col gap-7 px-4 py-6 sm:px-6">
            <TitleFacts details={details} onSelectPerson={onSelectPerson} />
            {details.mediaType === "movie" && details.runtime ? (
              <PulseLabPrototype key={`${details.tmdbId}-${details.runtime}`} title={details.title} runtimeMinutes={details.runtime} />
            ) : null}
            <TitleCast details={details} onSelectPerson={onSelectPerson} />
            <TitleWatchState details={details} existing={existing} onSave={onSave} onRemove={onRemove} />
            <TitleMediaSections details={details} />
            {details.recommendations.length ? (
              <section>
                <SectionLabel>More like this</SectionLabel>
                <div className="mt-3">
                  <TitleGrid titles={details.recommendations} library={library} onSelect={onSelectTitle} compact />
                </div>
              </section>
            ) : null}
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
