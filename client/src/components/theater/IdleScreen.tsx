import { useEffect, useState } from "react";

// Standby screen for the theater when nothing is loaded. Ambient — space
// name + a live clock + the date, arranged off-axis so the canvas reads
// as "on, resting" rather than "broken." No CTA: the top chrome already
// carries the library picker (and the navbar can take you elsewhere).
//
// The asymmetry is intentional: clock anchored slightly left-of-centre,
// micro-copy tucked in the opposite corner, soft glow displaced to one
// side. Easier on the eye than a centered logo + form.
export function IdleScreen({ spaceName }: { spaceName: string }) {
  const [now, setNow] = useState(() => new Date());

  // Re-render once per minute — we only show HH:MM and a date, so the
  // 15-second poll the old screen had was overkill.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const time = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const dateLabel = now.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });

  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      {/* Soft, off-centre glow — sits behind the clock and decays into the
          opposite corner. Pure ambient, no semantics. */}
      <div
        className="absolute inset-0"
        style={{ background: "radial-gradient(680px 500px at 36% 48%, hsl(0 90% 60% / 0.10), transparent 65%)" }}
        aria-hidden
      />

      {/* Clock — anchored left-of-centre, just above vertical middle.
          tabular-nums keeps colon glyphs from jittering as the time ticks. */}
      <div className="relative flex h-full w-full items-center">
        <div className="ml-[6vw] flex max-w-full flex-col gap-5 sm:ml-[10vw]">
          <div className="font-mono text-[10px] uppercase tracking-[0.42em] text-white/35">
            {spaceName} <span className="text-white/20">·</span> standby
          </div>
          <div className="font-mono text-[clamp(4rem,13vw,9.5rem)] font-medium leading-none tabular-nums text-white/85">
            {time}
          </div>
          <div className="flex items-center gap-3 text-white/35">
            <span className="h-px w-10 bg-white/15" aria-hidden />
            <span className="font-mono text-[11px] uppercase tracking-[0.28em]">{dateLabel}</span>
          </div>
        </div>
      </div>

      {/* Quiet caption tucked into the opposite corner — completes the
          diagonal balance with the clock. */}
      <div className="pointer-events-none absolute bottom-8 right-6 hidden text-right sm:bottom-12 sm:right-12 sm:block">
        <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-white/30">Nothing playing</div>
        <div className="mt-1.5 max-w-[22ch] text-xs leading-relaxed text-white/30">Pick something from your library or a synced collection to start.</div>
      </div>
    </div>
  );
}
