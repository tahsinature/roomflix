import { useEffect, useState, type ReactNode } from "react";
import { Check, GitCompareArrows } from "lucide-react";
import type { TitleLibraryItem } from "@shared/protocol";
import { Modal } from "@/components/Modal";
import { cn } from "@/lib/utils";
import { formatRuntime, formatVotes, posterUrl } from "./discover-utils";

const MAX_COMPARE_TITLES = 4;

export function WatchlistCompareModal({ open, items, onClose }: { open: boolean; items: TitleLibraryItem[]; onClose: () => void }) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    if (open) setSelectedIds(items.slice(0, MAX_COMPARE_TITLES).map((item) => item.id));
  }, [open, items]);

  const selected = selectedIds.flatMap((id) => {
    const item = items.find((candidate) => candidate.id === id);
    return item ? [item] : [];
  });

  const toggle = (id: string) => {
    setSelectedIds((current) => {
      if (current.includes(id)) return current.filter((candidate) => candidate !== id);
      return current.length < MAX_COMPARE_TITLES ? [...current, id] : current;
    });
  };

  return (
    <Modal open={open} title="Compare watchlist" onClose={onClose} className="max-w-6xl">
      <div className="flex flex-col gap-5">
        <div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <GitCompareArrows className="h-4 w-4 text-accent" /> Pick two to four titles. Your shortlist stays unchanged.
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {items.map((item) => {
              const active = selectedIds.includes(item.id);
              const disabled = !active && selectedIds.length >= MAX_COMPARE_TITLES;
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => toggle(item.id)}
                  className={cn(
                    "inline-flex items-center gap-1.5 border px-2.5 py-1.5 text-[10px] transition",
                    active ? "border-accent/50 bg-accent/10 text-accent" : "border-border text-muted-foreground hover:text-foreground",
                    disabled && "cursor-not-allowed opacity-35",
                  )}
                >
                  {active ? <Check className="h-3 w-3" /> : null}
                  {item.title}
                </button>
              );
            })}
          </div>
        </div>

        {selected.length >= 2 ? (
          <ComparisonTable items={selected} />
        ) : (
          <p className="border border-border p-8 text-center text-xs text-muted-foreground">Choose at least two titles to compare.</p>
        )}
      </div>
    </Modal>
  );
}

function ComparisonTable({ items }: { items: TitleLibraryItem[] }) {
  return (
    <div className="overflow-x-auto border border-border">
      <table className="w-full min-w-[44rem] border-collapse text-xs">
        <thead>
          <tr className="bg-card/70">
            <th className="w-32 border-b border-r border-border p-3 text-left text-[9px] uppercase tracking-[0.14em] text-muted-foreground">Signal</th>
            {items.map((item) => (
              <th key={item.id} className="min-w-36 border-b border-r border-border p-3 text-left align-top last:border-r-0">
                <div className="flex gap-2">
                  {item.posterPath ? <img src={posterUrl(item.posterPath, "w185") ?? ""} alt="" className="h-16 w-11 object-cover" /> : null}
                  <div>
                    <p className="font-semibold leading-snug">{item.title}</p>
                    <p className="mt-1 text-[9px] font-normal uppercase tracking-[0.1em] text-text-dim">{item.mediaType === "tv" ? "Series" : "Film"}</p>
                  </div>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <ComparisonRow label="Release" items={items} render={(item) => item.year || "Unknown"} />
          <ComparisonRow label="TMDB rating" items={items} render={(item) => (item.voteAverage ? `${item.voteAverage.toFixed(1)} / 10` : "Unrated")} />
          <ComparisonRow label="Audience" items={items} render={(item) => `${formatVotes(item.voteCount)} votes`} />
          <ComparisonRow label="Runtime" items={items} render={(item) => formatRuntime(item.runtime)} />
          <ComparisonRow label="Genres" items={items} render={(item) => item.genres.join(" · ") || "Unknown"} />
          <ComparisonRow label="My rating" items={items} render={(item) => (item.userRating ? `${item.userRating} / 5` : "Not rated")} />
        </tbody>
      </table>
    </div>
  );
}

function ComparisonRow({ label, items, render }: { label: string; items: TitleLibraryItem[]; render: (item: TitleLibraryItem) => ReactNode }) {
  return (
    <tr>
      <th className="border-b border-r border-border bg-background/40 p-3 text-left text-[9px] font-normal uppercase tracking-[0.13em] text-muted-foreground">{label}</th>
      {items.map((item) => (
        <td key={item.id} className="border-b border-r border-border p-3 align-top text-foreground/85 last:border-r-0">
          {render(item)}
        </td>
      ))}
    </tr>
  );
}
