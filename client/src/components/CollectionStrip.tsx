import { useEffect, useRef, useState } from "react";
import { Ban, ChevronDown, ChevronUp, Film, ListVideo, Music, Pencil, Repeat, SkipBack, SkipForward } from "lucide-react";
import type { Collection, CollectionHealth, CollectionItem } from "@shared/protocol";
import { cn, mediaKind, urlFilename } from "@/lib/utils";

// Live collection filmstrip shown under the player when a collection is
// loaded. Each item shows a thumbnail (photos) or a media-kind icon
// (video / audio); the synced item is highlighted and click-to-jump.
// Replaces the old PlaylistQueue + AlbumStrip — one strip for all media.
export function CollectionStrip({
  collection,
  health,
  currentIndex,
  loop,
  onNext,
  onPrev,
  onJumpTo,
  onToggleLoop,
  onEdit,
}: {
  collection: Collection | null;
  // Per-URL availability — items that probed "gone" are marked unavailable.
  health?: CollectionHealth | null;
  currentIndex: number;
  loop: boolean;
  onNext: () => void;
  onPrev: () => void;
  onJumpTo: (index: number) => void;
  onToggleLoop: (next: boolean) => void;
  // When set, the header shows an "edit collection" button.
  onEdit?: () => void;
}) {
  const [open, setOpen] = useState(true);
  const listRef = useRef<HTMLUListElement>(null);

  // Re-open whenever the loaded collection changes.
  useEffect(() => {
    if (collection?.id) setOpen(true);
  }, [collection?.id]);

  // Keep the active item scrolled into view as the synced index moves.
  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.children[currentIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [currentIndex, open]);

  if (!collection) return null;
  const count = collection.items.length;

  return (
    <aside className="border border-white/10 bg-black/70 backdrop-blur-xl">
      <header className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <ListVideo className="h-3.5 w-3.5 shrink-0 text-accent" />
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-white/90">{collection.title}</div>
            <div className="font-mono text-[10px] text-white/45">{count === 0 ? "Empty collection" : `${currentIndex + 1} / ${count}`}</div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <StripButton label="Previous" onClick={onPrev}>
            <SkipBack className="h-3.5 w-3.5" />
          </StripButton>
          <StripButton label="Next" onClick={onNext}>
            <SkipForward className="h-3.5 w-3.5" />
          </StripButton>
          <button
            type="button"
            aria-label={loop ? "Disable loop" : "Enable loop"}
            title={loop ? "Loop is on" : "Loop is off"}
            onClick={() => onToggleLoop(!loop)}
            className={cn("flex h-7 w-7 items-center justify-center transition", loop ? "text-accent" : "text-white/55 hover:text-white")}
          >
            <Repeat className="h-3.5 w-3.5" />
          </button>
          {onEdit && (
            <StripButton label="Edit collection" onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5" />
            </StripButton>
          )}
          <StripButton label={open ? "Collapse filmstrip" : "Expand filmstrip"} onClick={() => setOpen((v) => !v)}>
            {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </StripButton>
        </div>
      </header>

      {open && count > 0 && (
        <ul ref={listRef} className="flex gap-1.5 overflow-x-auto p-2">
          {collection.items.map((item, i) => {
            const broken = health?.items[item.url] === "gone";
            const name = item.name || urlFilename(item.url);
            return (
              <li key={`${item.url}-${i}`} className="shrink-0">
                <button
                  type="button"
                  onClick={() => onJumpTo(i)}
                  title={broken ? `Unavailable — ${name}` : name}
                  aria-current={i === currentIndex}
                  aria-label={`Item ${i + 1}: ${name}${broken ? " (unavailable)" : ""}`}
                  className={cn(
                    "relative block h-16 w-16 overflow-hidden border transition",
                    i === currentIndex ? "border-accent ring-1 ring-accent" : broken ? "border-accent/40" : "border-white/15 opacity-65 hover:opacity-100",
                  )}
                >
                  <span className={cn("block h-full w-full", broken && "opacity-30")}>
                    <Thumb item={item} />
                  </span>
                  <span className="absolute left-0.5 top-0.5 bg-black/70 px-1 font-mono text-[9px] text-white/80">{i + 1}</span>
                  {broken && (
                    <span className="absolute inset-0 flex items-center justify-center">
                      <Ban className="h-5 w-5 text-accent drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]" />
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}

function StripButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} onClick={onClick} className="flex h-7 w-7 items-center justify-center text-white/55 transition hover:text-white">
      {children}
    </button>
  );
}

// Thumbnail cell — a real image for photos. Video / audio URLs have no
// still frame, so they show a media-kind glyph plus the name, which makes
// them recognizable at a glance the way a photo thumbnail is.
function Thumb({ item }: { item: CollectionItem }) {
  const kind = mediaKind(item.url);
  if (kind === "image") {
    return <img src={item.url} alt="" loading="lazy" className="h-full w-full object-cover" />;
  }
  return (
    <span className="flex h-full w-full flex-col items-center justify-center gap-1 bg-white/[0.06] px-1 text-white/55">
      {kind === "audio" ? <Music className="h-4 w-4 shrink-0" /> : <Film className="h-4 w-4 shrink-0" />}
      <span className="line-clamp-2 break-all text-center text-[8px] leading-[1.15] text-white/70">{item.name || urlFilename(item.url)}</span>
    </span>
  );
}
