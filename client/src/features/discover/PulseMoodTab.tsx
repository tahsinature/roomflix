import { CircleHelp, Gauge, Heart, LockKeyhole, Zap, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useHistoryEntryState } from "@/navigation/history-entry-memory";
import { PulseGraph } from "./PulseGraph";
import { PULSE_SIGNALS, type PulseRecap, type PulseSignalKey } from "./pulse-data";

const SIGNAL_ICONS: Record<PulseSignalKey, LucideIcon> = {
  tension: Zap,
  fear: CircleHelp,
  intimacy: Heart,
  pace: Gauge,
};

export function PulseMoodTab({ progressPercent, recap }: { progressPercent: number; recap: PulseRecap }) {
  const [activeSignals, setActiveSignals] = useHistoryEntryState<Set<PulseSignalKey>>(
    "discover.pulse.mood-signals",
    () => new Set(PULSE_SIGNALS.map((signal) => signal.key)),
  );
  const [revealFutureMood, setRevealFutureMood] = useHistoryEntryState("discover.pulse.future-mood", false);
  const toggle = (key: PulseSignalKey) =>
    setActiveSignals((current) => {
      const next = new Set(current);
      if (next.has(key) && next.size > 1) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-accent">Current rhythm</p>
          <p className="mt-0.5 text-sm font-semibold">{recap.phase}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{recap.phaseDetail}</p>
        </div>
        <button
          type="button"
          aria-pressed={revealFutureMood}
          onClick={() => setRevealFutureMood((current) => !current)}
          className={cn(
            "flex h-8 items-center gap-1.5 border px-3 text-[10px] transition",
            revealFutureMood ? "border-amber-400/40 bg-amber-400/10 text-amber-300" : "border-border text-muted-foreground hover:text-foreground",
          )}
        >
          <LockKeyhole className="h-3 w-3" />
          {revealFutureMood ? "Hide future mood" : "Reveal future mood only"}
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {PULSE_SIGNALS.map((signal) => {
          const Icon = SIGNAL_ICONS[signal.key];
          const active = activeSignals.has(signal.key);
          return (
            <button
              key={signal.key}
              type="button"
              title={signal.description}
              aria-pressed={active}
              onClick={() => toggle(signal.key)}
              className={cn(
                "flex items-center gap-2 border px-3 py-2 text-left text-[10px] transition",
                active ? "border-accent/40 bg-accent/10 text-foreground" : "border-border text-text-dim",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {signal.label}
            </button>
          );
        })}
      </div>
      <PulseGraph activeSignals={activeSignals} progressPercent={progressPercent} revealFutureMood={revealFutureMood} />
      <p className="text-[9px] leading-relaxed text-muted-foreground">Illustrative only. Future AI analysis will include confidence and evidence for every segment.</p>
    </div>
  );
}
