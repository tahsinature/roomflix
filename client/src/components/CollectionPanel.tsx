import { useEffect, useMemo, useRef, useState } from "react";
import { Ban, Film, ListVideo, Music, PanelBottom, Pencil, Repeat, Search, SkipBack, SkipForward, X } from "lucide-react";
import type { Collection, CollectionHealth, CollectionItem } from "@shared/protocol";
import { cn, mediaKind, urlFilename } from "@/lib/utils";

// Vertical/left-side counterpart of CollectionStrip. Same data, same
// click-to-jump semantics, just rotated 90° into a sidebar with a
// search input. Useful when you want to skim a long collection without
// the bottom strip eating vertical room.
export function CollectionPanel({
  collection,
  health,
  currentIndex,
  loop,
  onNext,
  onPrev,
  onJumpTo,
  onToggleLoop,
  onEdit,
  onMoveToBottom,
}: {
  collection: Collection | null;
  health?: CollectionHealth | null;
  currentIndex: number;
  loop: boolean;
  onNext: () => void;
  onPrev: () => void;
  onJumpTo: (index: number) => void;
  onToggleLoop: (next: boolean) => void;
  onEdit?: () => void;
  // Flips the layout back to the horizontal bottom strip.
  onMoveToBottom: () => void;
}) {
  const [query, setQuery] = useState("");
  const listRef = useRef<HTMLUListElement>(null);

  // Keep the active item in view as the synced index moves.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${currentIndex}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [currentIndex]);

  const filtered = useMemo(() => {
    if (!collection) return [];
    const q = query.trim().toLowerCase();
    const all = collection.items.map((item, i) => ({ item, i }));
    if (!q) return all;
    return all.filter(({ item }) => `${item.name ?? ""} ${urlFilename(item.url) ?? ""}`.toLowerCase().includes(q));
  }, [collection, query]);

  if (!collection) return null;
  const count = collection.items.length;

  return (
    <aside className="hidden h-full w-[300px] shrink-0 flex-col border-r border-white/10 bg-black md:flex">
      <header className="border-b border-white/[0.06] px-3 py-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <ListVideo className="h-3.5 w-3.5 shrink-0 text-accent" />
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-white/90" title={collection.title}>
                {collection.title}
              </div>
              <div className="font-mono text-[10px] text-white/45">{count === 0 ? "Empty" : `${currentIndex + 1} / ${count}`}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={onMoveToBottom}
            aria-label="Move to bottom"
            title="Move filmstrip to bottom"
            className="flex h-7 w-7 shrink-0 items-center justify-center text-white/55 transition hover:text-white"
          >
            <PanelBottom className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="mt-2 flex items-center gap-1">
          <PanelButton label="Previous" onClick={onPrev}>
            <SkipBack className="h-3.5 w-3.5" />
          </PanelButton>
          <PanelButton label="Next" onClick={onNext}>
            <SkipForward className="h-3.5 w-3.5" />
          </PanelButton>
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
            <PanelButton label="Edit collection" onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5" />
            </PanelButton>
          )}
        </div>
      </header>

      <div className="border-b border-white/[0.06] px-3 py-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/40" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search items…"
            aria-label="Search collection"
            className="h-8 w-full border border-white/10 bg-bg-elevated/50 pl-7 pr-7 text-sm text-white placeholder:text-white/40 focus:border-accent/40 focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute right-1.5 top-1/2 inline-flex h-5 w-5 -translate-y-1/2 items-center justify-center text-white/40 transition hover:text-white"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {count === 0 ? (
          <div className="flex h-full items-center justify-center text-xs text-white/35">Empty collection</div>
        ) : filtered.length === 0 ? (
          <div className="flex h-full items-center justify-center text-xs text-white/35">No matches.</div>
        ) : (
          <ul ref={listRef} className="flex flex-col gap-1">
            {filtered.map(({ item, i }) => {
              const broken = health?.items[item.url] === "gone";
              const active = i === currentIndex;
              return (
                <CollectionRow
                  key={`${item.url}-${i}`}
                  item={item}
                  index={i}
                  active={active}
                  broken={broken}
                  onClick={() => onJumpTo(i)}
                />
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}

function PanelButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className="flex h-7 w-7 items-center justify-center text-white/55 transition hover:text-white">
      {children}
    </button>
  );
}

function CollectionRow({ item, index, active, broken, onClick }: { item: CollectionItem; index: number; active: boolean; broken: boolean; onClick: () => void }) {
  const name = item.name || urlFilename(item.url) || "Untitled";
  return (
    <li>
      <button
        type="button"
        data-index={index}
        onClick={onClick}
        title={broken ? `Unavailable — ${name}` : name}
        aria-current={active}
        className={cn(
          "flex w-full items-center gap-2 border px-2 py-1.5 text-left transition",
          active ? "border-accent/60 bg-accent/10" : broken ? "border-accent/30 bg-bg-elevated/20 opacity-70" : "border-white/[0.06] bg-bg-elevated/30 hover:border-accent/40 hover:bg-bg-elevated/50",
        )}
      >
        <div className="relative h-10 w-10 shrink-0 overflow-hidden border border-white/10">
          <Thumb item={item} />
          <span className="absolute left-0.5 top-0.5 bg-black/70 px-1 font-mono text-[9px] text-white/80">{index + 1}</span>
          {broken && (
            <span className="absolute inset-0 flex items-center justify-center bg-black/50">
              <Ban className="h-4 w-4 text-accent" />
            </span>
          )}
        </div>
        <span className="line-clamp-2 text-[12px] leading-tight text-white/85">{name}</span>
      </button>
    </li>
  );
}

function Thumb({ item }: { item: CollectionItem }) {
  const kind = mediaKind(item.url);
  if (kind === "image") return <img src={item.url} alt="" loading="lazy" className="h-full w-full object-cover" />;
  return (
    <span className="flex h-full w-full items-center justify-center bg-white/[0.05] text-white/60">
      {kind === "audio" ? <Music className="h-4 w-4" /> : <Film className="h-4 w-4" />}
    </span>
  );
}
