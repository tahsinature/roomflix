import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

// Three bezel chromes for the home page mini-theater. Each wraps the
// same `children` (the actual screen content — live preview or standby
// fill) in a different frame so the surface can read as "a little
// theater" without locking us into one aesthetic. The user picks one in
// Settings > Profile (P3); this component just renders it.
export type BezelStyle = "cinema" | "crt" | "minimal";

type Props = {
  style?: BezelStyle;
  playing: boolean;
  // Left-side top chip — usually "ON AIR" / "STANDBY".
  statusLabel: string;
  // Right-side top chip — usually media kind or "THEATER".
  kindLabel: string;
  // Bottom caption — playing title or a soft "Step into the theater".
  caption: string;
  onOpen: () => void;
  ariaLabel: string;
  // The actual screen content; rendered inside an aspect-video well.
  children: React.ReactNode;
};

export function TheaterBezel(props: Props) {
  const { style = "cinema" } = props;
  if (style === "crt") return <CrtBezel {...props} />;
  if (style === "minimal") return <MinimalBezel {...props} />;
  return <CinemaBezel {...props} />;
}

// Cinema marquee — warm accent glow above the screen, two thin gilded
// strips for top + bottom bezel, a faint spotlight halo. Subtle, no
// red velvet or popcorn.
function CinemaBezel({ playing, statusLabel, kindLabel, caption, onOpen, ariaLabel, children }: Props) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={ariaLabel}
      className={cn(
        "group relative block w-full text-left transition",
        playing ? "shadow-[0_40px_120px_-32px_hsl(0_100%_60%/0.45)]" : "shadow-[0_30px_80px_-32px_rgba(0,0,0,0.6)]",
      )}
    >
      {/* Marquee spotlight — sits above the top bezel and bleeds down
          over it, a touch warmer when playing. */}
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 -top-6 h-12 opacity-70 blur-2xl transition",
          playing ? "bg-gradient-to-b from-accent/45 to-transparent" : "bg-gradient-to-b from-accent/20 to-transparent",
        )}
        aria-hidden
      />

      <div
        className={cn(
          "relative overflow-hidden border bg-bg-elevated/30 transition",
          playing ? "border-accent/40 group-hover:border-accent/70" : "border-accent/15 group-hover:border-accent/35",
        )}
      >
        {/* Top bezel — small running pulse + theater wordmark. */}
        <div className="flex items-center justify-between gap-3 border-b border-accent/15 bg-gradient-to-b from-accent/[0.08] via-black/40 to-black/60 px-4 py-2">
          <span className={cn("flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.28em]", playing ? "text-accent" : "text-accent/55")}>
            <span className={cn("h-1.5 w-1.5 rounded-full", playing ? "animate-pulse-soft bg-accent shadow-[0_0_8px_hsl(0_100%_65%/0.7)]" : "bg-accent/40")} aria-hidden />
            {statusLabel}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.32em] text-accent/40">THEATER</span>
        </div>

        {/* The screen well — aspect-video, plain black, content slots in. */}
        <div className="relative aspect-video w-full overflow-hidden bg-black">
          {children}
          {/* Bottom-fade so any in-screen caption stays readable. */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/85 via-black/15 to-transparent" />
        </div>

        {/* Bottom plinth — caption + open caret. */}
        <div className="flex items-center justify-between gap-3 border-t border-accent/15 bg-gradient-to-t from-accent/[0.06] via-black/40 to-black/60 px-4 py-2.5">
          <span className="line-clamp-1 text-sm font-medium text-foreground">{caption}</span>
          <span className="flex shrink-0 items-center gap-1 font-mono text-[11px] uppercase tracking-[0.18em] text-accent transition group-hover:text-accent-bright">
            Open
            <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-accent/35">· {kindLabel}</span>
        </div>
      </div>
    </button>
  );
}

// CRT television — rounded corners on the screen, a faint scanline
// overlay, plastic-grey bezel. Reads as a vintage console.
function CrtBezel({ playing, statusLabel, kindLabel, caption, onOpen, ariaLabel, children }: Props) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={ariaLabel}
      className="group relative block w-full text-left shadow-[0_30px_80px_-32px_rgba(0,0,0,0.7)] transition"
    >
      <div className="relative overflow-hidden rounded-3xl border border-zinc-500/30 bg-gradient-to-b from-zinc-700/30 via-zinc-800/30 to-zinc-900/40 p-3 transition group-hover:border-zinc-400/45">
        <div className="flex items-center justify-between px-1 pb-2 text-zinc-300/80">
          <span className={cn("flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em]", playing ? "text-emerald-300" : "text-zinc-400/60")}>
            <span className={cn("h-1.5 w-1.5 rounded-full", playing ? "animate-pulse-soft bg-emerald-400" : "bg-zinc-500/60")} aria-hidden />
            {statusLabel}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-zinc-500/70">{kindLabel}</span>
        </div>
        <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-black">
          {children}
          {/* Scanline overlay — thin horizontal lines + a subtle vignette. */}
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.18]"
            style={{ backgroundImage: "repeating-linear-gradient(0deg, rgba(255,255,255,0.5) 0, rgba(255,255,255,0.5) 1px, transparent 1px, transparent 3px)" }}
            aria-hidden
          />
          <div className="pointer-events-none absolute inset-0 rounded-2xl shadow-[inset_0_0_60px_rgba(0,0,0,0.6)]" aria-hidden />
        </div>
        <div className="flex items-center justify-between px-1 pt-2.5 text-zinc-300/85">
          <span className="line-clamp-1 text-sm font-medium">{caption}</span>
          <span className="flex shrink-0 items-center gap-1 font-mono text-[11px] uppercase tracking-[0.16em] text-emerald-300/85 transition group-hover:text-emerald-200">
            Open
            <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
          </span>
        </div>
      </div>
    </button>
  );
}

// Minimal — hairline frame, no decoration, big shadow. Pure modern.
function MinimalBezel({ playing, statusLabel, kindLabel, caption, onOpen, ariaLabel, children }: Props) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={ariaLabel}
      className="group relative block w-full text-left shadow-[0_40px_120px_-30px_rgba(0,0,0,0.85)] transition"
    >
      <div className="relative overflow-hidden border border-white/10 bg-black transition group-hover:border-white/20">
        <div className="relative aspect-video w-full overflow-hidden bg-black">
          {children}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black via-black/40 to-transparent" />
          <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-3 px-4 py-3">
            <span className={cn("flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-white/75", playing && "text-white")}>
              <span className={cn("h-1.5 w-1.5 rounded-full", playing ? "animate-pulse-soft bg-accent" : "bg-white/40")} aria-hidden />
              {statusLabel}
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/45">{kindLabel}</span>
          </div>
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 px-4 pb-3">
            <span className="line-clamp-1 text-sm font-medium text-white">{caption}</span>
            <span className="flex shrink-0 items-center gap-1 font-mono text-[11px] uppercase tracking-[0.18em] text-accent transition group-hover:text-accent-bright">
              Open
              <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}
