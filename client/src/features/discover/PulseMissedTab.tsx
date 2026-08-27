import { EyeOff, LockKeyhole } from "lucide-react";
import { cn } from "@/lib/utils";
import { useHistoryEntryState } from "@/navigation/history-entry-memory";
import { formatPulseTime } from "./pulse-data";

export function PulseMissedTab({ progressMinutes, runtimeMinutes }: { progressMinutes: number; runtimeMinutes: number }) {
  const [windowMinutes, setWindowMinutes] = useHistoryEntryState("discover.pulse.missed-window", 5);
  const start = Math.max(0, progressMinutes - windowMinutes);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 border border-border bg-background/45 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[9px] uppercase tracking-[0.16em] text-accent">Recap window</p>
          <p className="mt-1 text-sm font-semibold">
            {formatPulseTime(start)} → {formatPulseTime(progressMinutes)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {[2, 5, 10].map((minutes) => (
            <button
              key={minutes}
              type="button"
              onClick={() => setWindowMinutes(minutes)}
              className={cn("h-8 border px-3 text-[10px]", minutes === windowMinutes ? "border-accent bg-accent text-white" : "border-border text-muted-foreground")}
            >
              {minutes} min
            </button>
          ))}
        </div>
      </div>
      <div className="relative h-8 overflow-hidden border border-border bg-muted/30">
        <div
          className="absolute inset-y-0 bg-accent/20 ring-1 ring-inset ring-accent/40"
          style={{ left: `${(start / runtimeMinutes) * 100}%`, width: `${((progressMinutes - start) / runtimeMinutes) * 100}%` }}
        />
        <div className="absolute inset-y-0 border-l border-cyan bg-card/80" style={{ left: `${(progressMinutes / runtimeMinutes) * 100}%`, right: 0 }} />
        <span className="absolute inset-0 grid place-items-center text-[8px] uppercase tracking-[0.14em] text-muted-foreground">Selected gap before your spoiler line</span>
      </div>
      <div className="border border-accent/20 bg-accent/[0.035] p-4">
        <p className="flex items-center gap-2 text-xs font-semibold text-accent">
          <EyeOff className="h-4 w-4" />
          What you missed
        </p>
        <ol className="mt-3 space-y-2 text-[10px] leading-relaxed text-foreground/75">
          <li>
            <strong className="text-foreground">01.</strong> A short exchange changed the group's immediate plan.
          </li>
          <li>
            <strong className="text-foreground">02.</strong> The lead noticed something important but did not explain it.
          </li>
          <li>
            <strong className="text-foreground">03.</strong> The objective stayed the same; only the route changed.
          </li>
        </ol>
      </div>
      <p className="flex items-center gap-1.5 text-[9px] text-muted-foreground">
        <LockKeyhole className="h-3 w-3" />
        This recap cannot reference anything after {formatPulseTime(progressMinutes)}.
      </p>
    </div>
  );
}
