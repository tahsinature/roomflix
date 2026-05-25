import { useEffect, useRef } from "react";
import { Ban } from "lucide-react";
import type { Collection, CollectionHealth } from "@shared/protocol";
import { Thumb } from "@/components/CollectionPanel";
import { cn, urlFilename } from "@/lib/utils";

// Horizontally-scrollable thumbnail strip for /watch on phones, where
// the desktop side panel (CollectionPanel) is hidden. Minimal by
// design — no search, no loop/shuffle/edit; those live on the desktop
// panel and the global "Edit collection" route. Tap a thumbnail to
// jump; the active item is highlighted and auto-centered as the synced
// index moves.
export function MobileCollectionStrip({
  collection,
  health,
  currentIndex,
  onJumpTo,
}: {
  collection: Collection | null;
  health?: CollectionHealth | null;
  currentIndex: number;
  onJumpTo: (index: number) => void;
}) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  // Keep the active thumb centered as the synced index moves. Uses the
  // data-index attribute so we can find the right button regardless of
  // how the list was filtered/searched (it isn't here, but matches the
  // desktop panel's pattern).
  useEffect(() => {
    const el = scrollerRef.current?.querySelector<HTMLElement>(`[data-index="${currentIndex}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [currentIndex]);

  if (!collection || collection.items.length === 0) return null;

  return (
    <div className="border-t border-white/10 bg-black/95 md:hidden">
      <div
        ref={scrollerRef}
        className="flex gap-1.5 overflow-x-auto px-2 py-2"
        style={{ scrollbarWidth: "none" }}
      >
        {collection.items.map((item, i) => {
          const active = i === currentIndex;
          const broken = health?.items[item.url] === "gone";
          const name = item.name || urlFilename(item.url) || "Untitled";
          return (
            <button
              key={`${item.url}-${i}`}
              type="button"
              data-index={i}
              onClick={() => onJumpTo(i)}
              aria-current={active}
              title={broken ? `Unavailable — ${name}` : name}
              className={cn(
                "relative h-12 w-12 shrink-0 overflow-hidden border transition",
                active
                  ? "border-accent ring-2 ring-accent/50"
                  : broken
                    ? "border-accent/30 opacity-60"
                    : "border-white/15",
              )}
            >
              <Thumb item={item} />
              <span className="absolute left-0.5 top-0.5 bg-black/70 px-1 font-mono text-[9px] text-white/85">{i + 1}</span>
              {broken && (
                <span className="absolute inset-0 flex items-center justify-center bg-black/50">
                  <Ban className="h-3.5 w-3.5 text-accent" />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
