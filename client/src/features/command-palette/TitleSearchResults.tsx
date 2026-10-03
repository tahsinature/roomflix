import { useRef, useState } from "react";
import { Check, Clapperboard, Loader2, Plus } from "lucide-react";
import type { DiscoverSearchResult } from "@shared/protocol";
import { CommandGroup, CommandItem, CommandShortcut } from "@/components/ui/command";
import { useToast } from "@/components/Toast";
import { posterUrl, titleIdentity, discoverTitlePath } from "@/features/discover/discover-utils";
import type { ComparisonSearchActions } from "./CommandPaletteProvider";

export function TitleSearchResults({
  titles,
  fuzzy,
  comparisonActions,
  addToComparison,
  goTo,
  onClose,
}: {
  titles: DiscoverSearchResult[];
  fuzzy: boolean;
  comparisonActions: ComparisonSearchActions | null;
  addToComparison: boolean;
  goTo: (path: string) => void;
  onClose: () => void;
}) {
  const [addingId, setAddingId] = useState<string | null>(null);
  const adding = useRef(false);
  const { error } = useToast();
  const addTitle = async (title: DiscoverSearchResult) => {
    if (!comparisonActions || adding.current || comparisonActions.addedIds.has(titleIdentity(title))) return;
    adding.current = true;
    setAddingId(titleIdentity(title));
    try {
      await comparisonActions.onAdd(title);
      onClose();
    } catch (reason) {
      error(reason instanceof Error ? reason.message : "Couldn't add this title.");
    } finally {
      adding.current = false;
      setAddingId(null);
    }
  };

  return (
    <CommandGroup heading={fuzzy ? "Closest titles" : "Movies & series"}>
      {titles.slice(0, 10).map((title) => {
        const id = titleIdentity(title);
        const added = comparisonActions?.addedIds.has(id);
        const poster = posterUrl(title.posterPath, "w92");
        return (
          <CommandItem
            key={id}
            value={`title ${title.title} ${title.year} ${title.mediaType}`}
            disabled={Boolean(addingId) || (addToComparison && added)}
            onSelect={() => (addToComparison && comparisonActions ? void addTitle(title) : goTo(discoverTitlePath(title)))}
          >
            <span className="grid h-10 w-7 shrink-0 place-items-center overflow-hidden rounded-[3px] bg-muted">
              {poster ? <img src={poster} alt="" className="h-full w-full object-cover" /> : <Clapperboard />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate">{title.title}</span>
              <span className="mt-0.5 block text-[9px] opacity-60">
                {title.mediaType === "tv" ? "Series" : "Movie"} · {title.year || "Year unknown"}
              </span>
            </span>
            {comparisonActions ? (
              addToComparison ? (
                <CommandShortcut>{addingId === id ? "Adding…" : added ? "Added" : "+ Add"}</CommandShortcut>
              ) : (
                <button
                  type="button"
                  disabled={added || Boolean(addingId)}
                  aria-label={added ? `${title.title} already in comparison` : `Add ${title.title} to comparison`}
                  title="Add to comparison"
                  onClick={(event) => {
                    event.stopPropagation();
                    void addTitle(title);
                  }}
                  className="grid size-8 shrink-0 place-items-center rounded-[4px] hover:bg-black/15 disabled:opacity-40"
                >
                  {addingId === id ? <Loader2 className="animate-spin" /> : added ? <Check /> : <Plus />}
                </button>
              )
            ) : null}
          </CommandItem>
        );
      })}
    </CommandGroup>
  );
}
