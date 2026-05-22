import { Link } from "react-router-dom";
import { LogOut } from "lucide-react";
import type { Viewer } from "@shared/protocol";
import { LibraryPicker } from "@/components/LibraryPicker";
import { cn } from "@/lib/utils";

type Props = {
  title: string;
  // Short context line under the title — e.g. "Album · photo 7 / 24".
  contextLabel: string;
  viewers: Viewer[];
  connected: boolean;
  onLoadUrl: (url: string) => void;
  // Fires as the library dropdown opens/closes so the theater can hold the
  // auto-hiding chrome open while the popover is up.
  onLibraryOpenChange?: (open: boolean) => void;
};

// Auto-hiding top chrome for the theater: an exit affordance, the
// now-playing summary, the live watcher list, and the library picker.
export function TheaterTopBar({ title, contextLabel, viewers, connected, onLoadUrl, onLibraryOpenChange }: Props) {
  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/85 via-black/45 to-transparent" />
      <div className="relative flex items-start justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            to="/library"
            aria-label="Back to library"
            title="Back to your library"
            className="flex h-9 w-9 shrink-0 items-center justify-center border border-white/15 bg-black/50 text-white/85 backdrop-blur transition hover:bg-black/70 hover:text-white"
          >
            <LogOut className="h-4 w-4 rotate-180" />
          </Link>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-white/95 sm:text-base" title={title}>
              {title}
            </div>
            <div className="truncate font-mono text-[11px] uppercase tracking-[0.16em] text-white/45">{contextLabel}</div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Watchers viewers={viewers} connected={connected} />
          <LibraryPicker onPick={onLoadUrl} onOpenChange={onLibraryOpenChange} />
        </div>
      </div>
    </div>
  );
}

// Compact live presence — a stack of viewer initials with an overflow
// count, plus a connection dot so the display reads as "live" at a glance.
function Watchers({ viewers, connected }: { viewers: Viewer[]; connected: boolean }) {
  const shown = viewers.slice(0, 4);
  const extra = viewers.length - shown.length;
  return (
    <div className="flex items-center gap-2 border border-white/12 bg-black/50 px-2.5 py-1.5 backdrop-blur" title={connected ? `${viewers.length} watching` : "Reconnecting…"}>
      <span
        className={cn("inline-flex h-2 w-2 shrink-0 rounded-full", connected ? "bg-emerald-400 shadow-[0_0_8px_rgb(52_211_153/0.7)]" : "animate-pulse-soft bg-amber-300")}
        aria-hidden
      />
      {viewers.length === 0 ? (
        <span className="font-mono text-[11px] text-white/45">No one watching</span>
      ) : (
        <div className="flex items-center -space-x-1.5">
          {shown.map((v) => (
            <span
              key={v.id}
              title={v.displayName}
              className="flex h-6 w-6 items-center justify-center rounded-full border border-black/60 bg-accent/85 text-[10px] font-semibold uppercase text-white"
            >
              {v.displayName.trim().charAt(0) || "?"}
            </span>
          ))}
          {extra > 0 && (
            <span className="flex h-6 w-6 items-center justify-center rounded-full border border-black/60 bg-white/15 text-[10px] font-semibold text-white">+{extra}</span>
          )}
        </div>
      )}
    </div>
  );
}
