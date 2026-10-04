import { Clock3, X } from "lucide-react";
import { CommandGroup, CommandItem } from "@/components/ui/command";

export function RecentSearches({
  terms,
  onSelect,
  onRemove,
  onClear,
}: {
  terms: string[];
  onSelect: (term: string) => void;
  onRemove: (term: string) => void;
  onClear: () => void;
}) {
  return (
    <>
      <div className="flex items-center justify-between px-4 pt-3 text-[9px] uppercase tracking-[0.13em] text-muted-foreground">
        <span>Recent searches</span>
        <button
          type="button"
          onClick={onClear}
          onKeyDown={(event) => event.stopPropagation()}
          className="rounded px-2 py-1 text-[10px] normal-case tracking-normal hover:text-foreground focus-visible:outline-accent"
        >
          Clear all
        </button>
      </div>
      <CommandGroup>
        {terms.map((term) => (
          <CommandItem key={term} value={`recent-search ${term}`} onSelect={() => onSelect(term)}>
            <Clock3 className="text-muted-foreground" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">{term}</span>
            <button
              type="button"
              aria-label={`Remove search “${term}”`}
              title="Remove recent search"
              className="grid size-8 shrink-0 place-items-center rounded hover:bg-white/10 focus-visible:outline-accent"
              onKeyDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                onRemove(term);
              }}
            >
              <X className="size-3" aria-hidden="true" />
            </button>
          </CommandItem>
        ))}
      </CommandGroup>
    </>
  );
}
