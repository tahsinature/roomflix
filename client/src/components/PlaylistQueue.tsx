import { ChevronDown, ChevronUp, Repeat, SkipBack, SkipForward } from "lucide-react";
import { useEffect, useState } from "react";
import type { PlaylistDetail } from "@shared/protocol";
import { cn } from "@/lib/utils";

// Live playlist queue + controls shown in the room when state.playlistId is
// set. Highlights the active index, lets viewers jump to any item, and
// surfaces Next/Prev/Loop.
export function PlaylistQueue({
  detail,
  currentIndex,
  loop,
  onNext,
  onPrev,
  onJumpTo,
  onToggleLoop,
}: {
  detail: PlaylistDetail | null;
  currentIndex: number;
  loop: boolean;
  onNext: () => void;
  onPrev: () => void;
  onJumpTo: (index: number) => void;
  onToggleLoop: (next: boolean) => void;
}) {
  // Default to expanded on first paint, but let the user collapse to get
  // their video real estate back.
  const [open, setOpen] = useState(true);

  // Reset to open whenever the loaded playlist changes — feels weird to
  // navigate to a new playlist and find the queue still collapsed.
  useEffect(() => {
    if (detail?.id) setOpen(true);
  }, [detail?.id]);

  if (!detail) return null;

  return (
    <aside className="border border-border bg-bg-elevated/40">
      <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="min-w-0 flex-1">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-dim">Playlist</div>
          <div className="truncate text-sm font-medium text-foreground">{detail.title}</div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            aria-label="Previous"
            onClick={onPrev}
            className="flex h-7 w-7 items-center justify-center text-text-dim transition hover:text-foreground"
          >
            <SkipBack className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            aria-label="Next"
            onClick={onNext}
            className="flex h-7 w-7 items-center justify-center text-text-dim transition hover:text-foreground"
          >
            <SkipForward className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            aria-label={loop ? "Disable loop" : "Enable loop"}
            onClick={() => onToggleLoop(!loop)}
            className={cn(
              "flex h-7 w-7 items-center justify-center transition",
              loop ? "text-accent" : "text-text-dim hover:text-foreground",
            )}
            title={loop ? "Loop is on" : "Loop is off"}
          >
            <Repeat className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            aria-label={open ? "Collapse queue" : "Expand queue"}
            onClick={() => setOpen((v) => !v)}
            className="flex h-7 w-7 items-center justify-center text-text-dim transition hover:text-foreground"
          >
            {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        </div>
      </header>

      {open && (
        <ul className="max-h-64 overflow-y-auto">
          {detail.videos.map((v, i) => {
            const active = i === currentIndex;
            const removed = !v;
            return (
              <li key={`${detail.id}-${i}`}>
                <button
                  type="button"
                  disabled={removed}
                  onClick={() => onJumpTo(i)}
                  className={cn(
                    "flex w-full items-center gap-2 border-b border-border px-3 py-2 text-left transition last:border-b-0",
                    active
                      ? "bg-accent/10 text-foreground"
                      : removed
                        ? "text-text-dim"
                        : "text-foreground/85 hover:bg-white/[0.03] hover:text-foreground",
                  )}
                >
                  <span className={cn("w-6 shrink-0 text-right font-mono text-[10px]", active ? "text-accent" : "text-text-dim")}>
                    {active ? "▶" : i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    {removed ? (
                      <span className="text-sm italic">Removed from library</span>
                    ) : (
                      <span className="block truncate text-sm">{v!.title}</span>
                    )}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
