import { useEffect, useMemo, useState } from "react";
import { Loader2, UserRound } from "lucide-react";
import type { DiscoverPersonDetails, DiscoverSearchResult, TitleLibraryItem } from "@shared/protocol";
import { Modal } from "@/components/Modal";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { posterUrl, type TitleSelection } from "./discover-utils";
import { TitleGrid } from "./TitleGrid";

type CreditMode = "acting" | "creative" | "production";
type CreditSort = "latest" | "popular" | "oldest";

export function DiscoverPersonModal({
  tmdbId,
  library,
  onClose,
  onSelectTitle,
}: {
  tmdbId: number | null;
  library: TitleLibraryItem[];
  onClose: () => void;
  onSelectTitle: (selection: TitleSelection) => void;
}) {
  const [person, setPerson] = useState<DiscoverPersonDetails | null>(null);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<CreditMode>("acting");
  const [sort, setSort] = useState<CreditSort>("latest");

  useEffect(() => {
    if (!tmdbId) return;
    let cancelled = false;
    setPerson(null);
    setError("");
    void api
      .discoverPerson(tmdbId)
      .then((value) => {
        if (!cancelled) {
          setPerson(value);
          setMode(value.knownForDepartment === "Production" ? "production" : value.knownForDepartment === "Acting" ? "acting" : "creative");
        }
      })
      .catch((reason) => {
        if (!cancelled) setError((reason as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [tmdbId]);

  const credits = useMemo(() => {
    if (!person) return [];
    const source = mode === "acting" ? person.actingCredits : mode === "creative" ? person.creativeCredits : person.productionCredits;
    return [...source].sort((a, b) => compareCredits(a, b, sort));
  }, [person, mode, sort]);

  return (
    <Modal open={tmdbId !== null} title={person?.name ?? "Person details"} onClose={onClose} className="max-w-6xl">
      {error ? <div className="border border-accent/30 bg-accent/10 p-4 text-sm text-accent">{error}</div> : null}
      {!error && !person ? (
        <div className="grid min-h-64 place-items-center">
          <Loader2 className="h-6 w-6 animate-spin text-accent" />
        </div>
      ) : null}
      {person ? (
        <div className="flex flex-col gap-6">
          <header className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row">
            <div className="h-32 w-28 shrink-0 overflow-hidden border border-border bg-bg-elevated">
              {person.profilePath ? (
                <img src={posterUrl(person.profilePath, "w185") ?? ""} alt={person.name} className="h-full w-full object-cover" />
              ) : (
                <div className="grid h-full place-items-center">
                  <UserRound className="h-8 w-8 text-text-dim" />
                </div>
              )}
            </div>
            <div className="min-w-0">
              <p className="text-[9px] uppercase tracking-[0.16em] text-accent">{person.knownForDepartment || "Film & television"}</p>
              <h2 className="mt-1 text-2xl font-bold">{person.name}</h2>
              {person.biography ? <p className="mt-3 line-clamp-5 max-w-3xl text-xs leading-relaxed text-muted-foreground">{person.biography}</p> : null}
            </div>
          </header>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap border border-border">
              <ModeButton active={mode === "acting"} onClick={() => setMode("acting")}>
                Acting · {person.actingCredits.length}
              </ModeButton>
              <ModeButton active={mode === "creative"} onClick={() => setMode("creative")}>
                Directed · {person.creativeCredits.length}
              </ModeButton>
              <ModeButton active={mode === "production"} onClick={() => setMode("production")}>
                Produced · {person.productionCredits.length}
              </ModeButton>
            </div>
            <label className="flex items-center gap-2 text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
              Sort
              <select
                value={sort}
                onChange={(event) => setSort(event.target.value as CreditSort)}
                className="h-8 border border-border bg-input px-2 text-[10px] normal-case tracking-normal text-foreground"
              >
                <option value="latest">Latest release</option>
                <option value="popular">Most reviewed</option>
                <option value="oldest">Oldest release</option>
              </select>
            </label>
          </div>
          {credits.length ? (
            <TitleGrid titles={credits} library={library} onSelect={onSelectTitle} />
          ) : (
            <p className="border border-border p-6 text-center text-xs text-muted-foreground">No supported credits in this category.</p>
          )}
        </div>
      ) : null}
    </Modal>
  );
}

function ModeButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "border-r border-border px-3 py-2 text-[10px] uppercase tracking-[0.11em] transition last:border-r-0",
        active ? "bg-accent text-white" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function compareCredits(a: DiscoverSearchResult, b: DiscoverSearchResult, sort: CreditSort): number {
  if (sort === "popular") return b.voteCount - a.voteCount;
  const aDate = a.releaseDate || (sort === "latest" ? "0000" : "9999");
  const bDate = b.releaseDate || (sort === "latest" ? "0000" : "9999");
  return sort === "latest" ? bDate.localeCompare(aDate) : aDate.localeCompare(bDate);
}
