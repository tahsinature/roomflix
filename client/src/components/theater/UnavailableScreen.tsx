import { Ban } from "lucide-react";

// Shown in the theater when the current collection item's URL probed as
// unreachable — the proactive counterpart to a runtime playback error,
// mirroring the "Unavailable" treatment in the Library list.
export function UnavailableScreen({ title }: { title: string }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-black px-6 text-center">
      <span className="flex h-16 w-16 items-center justify-center border border-accent/40 bg-accent/10 text-accent">
        <Ban className="h-7 w-7" />
      </span>
      <div className="flex max-w-[42rem] flex-col items-center gap-1.5">
        <span className="line-clamp-2 font-mono text-base font-medium text-white/90 sm:text-lg" title={title}>
          {title}
        </span>
        <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent/85">Unavailable</span>
        <span className="mt-1 text-xs text-white/45">This item's URL couldn't be reached — pick another from the filmstrip below.</span>
      </div>
    </div>
  );
}
