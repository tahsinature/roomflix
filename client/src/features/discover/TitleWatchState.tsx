import { useEffect, useState } from "react";
import { Bookmark, Check, ExternalLink, Star, Trash2 } from "lucide-react";
import type { DiscoverTitleDetails, TitleLibraryItem, TitleLibraryStatus } from "@shared/protocol";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toLibraryPayload } from "./discover-utils";
import { SectionLabel } from "./TitleDetailSections";

type LibraryPayload = Omit<TitleLibraryItem, "id" | "userId" | "addedAt" | "updatedAt">;

export function TitleWatchState({
  details,
  existing,
  onSave,
  onRemove,
}: {
  details: DiscoverTitleDetails;
  existing?: TitleLibraryItem;
  onSave: (item: LibraryPayload) => Promise<void>;
  onRemove: (mediaType: DiscoverTitleDetails["mediaType"], tmdbId: number) => Promise<void>;
}) {
  const [rating, setRating] = useState<number | null>(existing?.userRating ?? null);
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setRating(existing?.userRating ?? null);
    setNotes(existing?.notes ?? "");
  }, [existing?.id, existing?.userRating, existing?.notes]);

  const save = async (status: TitleLibraryStatus) => {
    setBusy(true);
    try {
      await onSave({ ...toLibraryPayload(details, status, existing), userRating: rating, notes });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <SectionLabel>My watch state</SectionLabel>
      <div className="mt-3 border border-border bg-card/50 p-4">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant={existing?.status === "shortlist" ? "accent" : "outline"} disabled={busy} onClick={() => void save("shortlist")}>
            <Bookmark className="h-3.5 w-3.5" />
            {existing?.status === "shortlist" ? "In watchlist" : "Add to watchlist"}
          </Button>
          <Button size="sm" variant={existing?.status === "watched" ? "accent" : "outline"} disabled={busy} onClick={() => void save("watched")}>
            <Check className="h-3.5 w-3.5" />
            {existing?.status === "watched" ? "Watched" : "Mark watched"}
          </Button>
          {existing ? (
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => void onRemove(details.mediaType, details.tmdbId)}>
              <Trash2 className="h-3.5 w-3.5" />
              Remove
            </Button>
          ) : null}
          {details.imdbId ? (
            <Button asChild size="sm" variant="ghost">
              <a href={`https://www.imdb.com/title/${details.imdbId}/`} target="_blank" rel="noreferrer">
                <ExternalLink className="h-3.5 w-3.5" />
                IMDb
              </a>
            </Button>
          ) : null}
        </div>
        {existing?.status === "watched" || rating !== null || notes ? (
          <div className="mt-4 grid gap-4 border-t border-border pt-4 sm:grid-cols-[auto_1fr]">
            <div>
              <p className="text-[9px] uppercase tracking-[0.15em] text-muted-foreground">My rating</p>
              <div className="mt-2 flex gap-1">
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setRating(rating === value ? null : value)}
                    aria-label={`${value} stars`}
                    className={cn("p-0.5", value <= (rating ?? 0) ? "text-amber-300" : "text-text-dim")}
                  >
                    <Star className={cn("h-4 w-4", value <= (rating ?? 0) && "fill-current")} />
                  </button>
                ))}
              </div>
            </div>
            <label>
              <span className="text-[9px] uppercase tracking-[0.15em] text-muted-foreground">Notes</span>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="What stayed with you?"
                className="mt-2 min-h-20 w-full resize-y border border-border bg-input/50 p-3 text-xs placeholder:text-text-dim"
              />
            </label>
            <div className="sm:col-start-2">
              <Button size="sm" disabled={busy || !existing} onClick={() => existing && void save(existing.status)}>
                Save notes
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
