import { useState, type ReactNode } from "react";
import { Activity, Brain, EyeOff, ShieldCheck, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { PulseMissedTab } from "./PulseMissedTab";
import { PulseMoodTab } from "./PulseMoodTab";
import { PulseRecapTab } from "./PulseRecapTab";
import { formatPulseTime, recapAt } from "./pulse-data";

type PulseTab = "mood" | "recap" | "missed";

export function PulseLabPrototype({ title, runtimeMinutes }: { title: string; runtimeMinutes: number }) {
  const [progressMinutes, setProgressMinutes] = useState(() => Math.min(20, Math.max(1, runtimeMinutes - 1)));
  const [tab, setTab] = useState<PulseTab>("mood");
  const recap = recapAt(progressMinutes, runtimeMinutes);
  const progressPercent = (progressMinutes / runtimeMinutes) * 100;

  return (
    <section className="relative overflow-hidden border border-accent/25 bg-card/65 shadow-[0_0_42px_hsl(var(--accent)/0.04)]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent to-transparent" />
      <header className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Activity className="h-5 w-5 text-accent" />
            <h3 className="text-base font-bold uppercase tracking-tight">Pulse Lab</h3>
            <span className="border border-amber-400/35 bg-amber-400/10 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.12em] text-amber-300">Prototype · demo data</span>
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">Read the rhythm of {title}, or catch up without crossing your spoiler line.</p>
        </div>
        <span className="inline-flex w-fit items-center gap-1.5 border border-cyan/30 bg-cyan/10 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-cyan">
          <ShieldCheck className="h-3.5 w-3.5" />
          Spoiler shield active
        </span>
      </header>

      <div className="p-4">
        <div className="border border-accent/20 bg-accent/[0.035] p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Spoiler boundary</p>
              <p className="mt-0.5 text-sm font-semibold">
                {formatPulseTime(progressMinutes)} <span className="font-normal text-muted-foreground">/ {formatPulseTime(runtimeMinutes)}</span>
              </p>
            </div>
            <span className="flex items-center gap-1.5 text-[9px] uppercase tracking-[0.14em] text-cyan">
              <ShieldCheck className="h-3 w-3" />
              Nothing beyond this point
            </span>
          </div>
          <input
            type="range"
            min="1"
            max={runtimeMinutes}
            value={progressMinutes}
            onChange={(event) => setProgressMinutes(Number(event.target.value))}
            aria-label="How much of the movie have you watched?"
            className="mt-3 h-1.5 w-full cursor-pointer accent-[hsl(var(--accent))]"
          />
          <div className="mt-1 flex justify-between text-[8px] uppercase tracking-[0.12em] text-text-dim">
            <span>Opening</span>
            <span>You are here</span>
            <span>Credits</span>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 border border-border" role="tablist" aria-label="Pulse Lab views">
          <PulseTabButton active={tab === "mood"} onClick={() => setTab("mood")} icon={Activity}>
            Mood map
          </PulseTabButton>
          <PulseTabButton active={tab === "recap"} onClick={() => setTab("recap")} icon={Brain}>
            Up to here
          </PulseTabButton>
          <PulseTabButton active={tab === "missed"} onClick={() => setTab("missed")} icon={EyeOff}>
            I looked away
          </PulseTabButton>
        </div>

        <div className="mt-4">
          {tab === "mood" ? <PulseMoodTab progressPercent={progressPercent} recap={recap} /> : null}
          {tab === "recap" ? <PulseRecapTab progressMinutes={progressMinutes} recap={recap} /> : null}
          {tab === "missed" ? <PulseMissedTab progressMinutes={progressMinutes} runtimeMinutes={runtimeMinutes} /> : null}
        </div>
      </div>
    </section>
  );
}

function PulseTabButton({ active, onClick, icon: Icon, children }: { active: boolean; onClick: () => void; icon: LucideIcon; children: ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "flex min-w-0 items-center justify-center gap-1.5 border-r border-border px-2 py-2.5 text-[10px] transition last:border-r-0",
        active ? "bg-accent/10 text-accent" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{children}</span>
    </button>
  );
}
