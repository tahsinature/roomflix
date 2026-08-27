import { useEffect, useMemo, useState } from "react";
import { Images, Loader2, RotateCw, UserRound } from "lucide-react";
import type { DiscoverPersonDetails, DiscoverSearchResult, TitleLibraryItem } from "@shared/protocol";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DiscoverDetailHeader } from "./DiscoverDetailHeader";
import { posterUrl, type TitleSelection } from "./discover-utils";
import { invalidatePersonDetails, loadPersonDetails } from "./person-details-cache";
import { prefetchImageGallery } from "./image-gallery-cache";
import { TitleGrid } from "./TitleGrid";
import { useHistoryEntryState } from "@/navigation/history-entry-memory";

type CreditMode = "acting" | "creative" | "production";
type CreditSort = "latest" | "popular" | "oldest";

export function DiscoverPersonView({
  tmdbId,
  library,
  onBack,
  onSelectTitle,
  onOpenGallery,
}: {
  tmdbId: number;
  library: TitleLibraryItem[];
  onBack: () => void;
  onSelectTitle: (selection: TitleSelection) => void;
  onOpenGallery: () => void;
}) {
  const [person, setPerson] = useState<DiscoverPersonDetails | null>(null);
  const [error, setError] = useState("");
  const [mode, setMode] = useHistoryEntryState<CreditMode>("discover.person.credit-mode", "acting");
  const [sort, setSort] = useHistoryEntryState<CreditSort>("discover.person.credit-sort", "latest");
  const [retryRevision, setRetryRevision] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setPerson(null);
    setError("");
    void loadPersonDetails(tmdbId)
      .then((value) => {
        if (cancelled) return;
        setPerson(value);
        setMode((current) => (creditsForMode(value, current).length ? current : defaultCreditMode(value)));
      })
      .catch((reason) => {
        if (!cancelled) setError((reason as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [retryRevision, tmdbId]);

  const credits = useMemo(() => {
    if (!person) return [];
    const source = mode === "acting" ? person.actingCredits : mode === "creative" ? person.creativeCredits : person.productionCredits;
    return [...source].sort((a, b) => compareCredits(a, b, sort));
  }, [mode, person, sort]);

  const retry = () => {
    invalidatePersonDetails(tmdbId);
    setRetryRevision((current) => current + 1);
  };

  return (
    <main className="min-h-full pb-12">
      <DiscoverDetailHeader label={person?.name ?? "Person details"} onBack={onBack} />

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
        ) : person ? (
          <PersonContent
            person={person}
            library={library}
            mode={mode}
            sort={sort}
            onModeChange={setMode}
            onSortChange={setSort}
            onSelectTitle={onSelectTitle}
            onOpenGallery={onOpenGallery}
            credits={credits}
          />
        ) : (
          <PersonLoadingPreview />
        )}
      </div>
    </main>
  );
}

function PersonContent({
  person,
  library,
  mode,
  sort,
  credits,
  onModeChange,
  onSortChange,
  onSelectTitle,
  onOpenGallery,
}: {
  person: DiscoverPersonDetails;
  library: TitleLibraryItem[];
  mode: CreditMode;
  sort: CreditSort;
  credits: DiscoverSearchResult[];
  onModeChange: (mode: CreditMode) => void;
  onSortChange: (sort: CreditSort) => void;
  onSelectTitle: (selection: TitleSelection) => void;
  onOpenGallery: () => void;
}) {
  const profile = posterUrl(person.profilePath, "w342");

  return (
    <article className="view-enter overflow-hidden border border-border bg-card/20">
      <header className="grid gap-5 border-b border-border p-5 sm:grid-cols-[9rem_minmax(0,1fr)] sm:p-7">
        <button
          type="button"
          onClick={onOpenGallery}
          onPointerEnter={() => prefetchImageGallery({ type: "person", tmdbId: person.tmdbId })}
          onFocus={() => prefetchImageGallery({ type: "person", tmdbId: person.tmdbId })}
          aria-label={`View photos of ${person.name}`}
          className="group relative aspect-[2/3] w-28 overflow-hidden border border-border bg-bg-elevated text-left transition-colors hover:border-accent/45 sm:w-36"
        >
          {profile ? (
            <img
              src={profile}
              alt={person.name}
              width={342}
              height={513}
              decoding="async"
              className="h-full w-full object-cover transition-[filter,transform] duration-300 group-hover:scale-[1.02] group-hover:brightness-75"
            />
          ) : (
            <div className="grid h-full place-items-center">
              <UserRound className="h-9 w-9 text-text-dim" aria-hidden="true" />
            </div>
          )}
          <span className="absolute inset-x-2 bottom-2 flex items-center justify-center gap-1.5 border border-white/15 bg-black/55 px-2 py-1.5 text-[8px] uppercase tracking-[0.1em] text-white opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
            <Images className="h-3 w-3" /> Photos
          </span>
        </button>
        <div className="min-w-0 self-center">
          <p className="text-[9px] uppercase tracking-[0.16em] text-accent">{person.knownForDepartment || "Film & television"}</p>
          <h1 className="mt-2 text-3xl font-bold sm:text-4xl">{person.name}</h1>
          {person.biography ? (
            <p className="mt-4 max-w-3xl text-sm leading-7 text-muted-foreground">{person.biography}</p>
          ) : (
            <p className="mt-4 text-sm text-text-dim">No biography is available.</p>
          )}
        </div>
      </header>

      <section aria-labelledby="person-credits-heading" className="p-4 sm:p-6">
        <div className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="section-label">Filmography</p>
            <h2 id="person-credits-heading" className="mt-2 text-xl font-semibold">
              Credits
            </h2>
          </div>
          <label className="flex min-h-11 items-center gap-2 text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
            Sort
            <select
              value={sort}
              onChange={(event) => onSortChange(event.target.value as CreditSort)}
              className="h-11 border border-border bg-input px-3 text-xs normal-case tracking-normal text-foreground"
            >
              <option value="latest">Latest release</option>
              <option value="popular">Most reviewed</option>
              <option value="oldest">Oldest release</option>
            </select>
          </label>
        </div>

        <div className="mt-5 grid grid-cols-3 border border-border" role="group" aria-label="Credit category">
          <ModeButton active={mode === "acting"} onClick={() => onModeChange("acting")}>
            Acting · {person.actingCredits.length}
          </ModeButton>
          <ModeButton active={mode === "creative"} onClick={() => onModeChange("creative")}>
            Directed · {person.creativeCredits.length}
          </ModeButton>
          <ModeButton active={mode === "production"} onClick={() => onModeChange("production")}>
            Produced · {person.productionCredits.length}
          </ModeButton>
        </div>

        <div className="mt-5">
          {credits.length ? (
            <TitleGrid titles={credits} library={library} onSelect={onSelectTitle} />
          ) : (
            <p className="border border-border p-8 text-center text-xs text-muted-foreground">No supported credits in this category.</p>
          )}
        </div>
      </section>
    </article>
  );
}

function PersonLoadingPreview() {
  return (
    <section className="view-enter grid min-h-80 place-items-center border border-border bg-card/20" aria-label="Loading person details">
      <span role="status" className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.13em] text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin text-accent" /> Loading person…
      </span>
    </section>
  );
}

function ModeButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "min-h-11 min-w-0 border-r border-border px-2 py-2 text-[9px] uppercase tracking-[0.08em] transition-colors last:border-r-0 sm:px-3 sm:text-[10px] sm:tracking-[0.11em]",
        active ? "bg-accent text-white" : "text-muted-foreground hover:bg-white/[0.035] hover:text-foreground",
      )}
    >
      <span className="line-clamp-2">{children}</span>
    </button>
  );
}

function defaultCreditMode(person: DiscoverPersonDetails): CreditMode {
  if (person.knownForDepartment === "Production") return "production";
  if (person.knownForDepartment === "Acting") return "acting";
  return "creative";
}

function creditsForMode(person: DiscoverPersonDetails, mode: CreditMode): DiscoverSearchResult[] {
  if (mode === "acting") return person.actingCredits;
  if (mode === "creative") return person.creativeCredits;
  return person.productionCredits;
}

function compareCredits(a: DiscoverSearchResult, b: DiscoverSearchResult, sort: CreditSort): number {
  if (sort === "popular") return b.voteCount - a.voteCount;
  const aDate = a.releaseDate || (sort === "latest" ? "0000" : "9999");
  const bDate = b.releaseDate || (sort === "latest" ? "0000" : "9999");
  return sort === "latest" ? bDate.localeCompare(aDate) : aDate.localeCompare(bDate);
}
