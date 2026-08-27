import { Brain, CircleHelp, ShieldCheck, Sparkles, Users, type LucideIcon } from "lucide-react";
import { useHistoryEntryState } from "@/navigation/history-entry-memory";
import { formatPulseTime, type PulseRecap } from "./pulse-data";

export function PulseRecapTab({ progressMinutes, recap }: { progressMinutes: number; recap: PulseRecap }) {
  const [showAnswer, setShowAnswer] = useHistoryEntryState("discover.pulse.show-answer", false);
  return (
    <div className="flex flex-col gap-3">
      <div className="border-l-2 border-cyan bg-cyan/5 px-3 py-2.5">
        <p className="flex items-center gap-2 text-xs font-semibold text-cyan">
          <ShieldCheck className="h-4 w-4" />
          Explained only through {formatPulseTime(progressMinutes)}
        </p>
        <p className="mt-1 text-[10px] text-muted-foreground">Names, reveals and consequences from later scenes remain locked.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <RecapCard icon={Sparkles} label="The situation" text={recap.situation} />
        <RecapCard icon={Users} label="Who matters" text={recap.people} />
        <RecapCard icon={Brain} label="What to remember" text={recap.remember} />
        <div className="border border-border bg-background/45 p-3">
          <p className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.14em] text-accent">
            <CircleHelp className="h-3.5 w-3.5" />
            Open threads
          </p>
          <ul className="mt-2 space-y-1.5 text-[10px] text-foreground/75">
            {recap.threads.map((thread) => (
              <li key={thread} className="flex gap-2">
                <span className="mt-1.5 h-1 w-1 shrink-0 bg-accent" />
                {thread}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="border border-border bg-background/45 p-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="flex items-center gap-2 text-xs font-semibold text-foreground">
              <CircleHelp className="h-4 w-4 text-amber-300" />
              Am I supposed to understand everything yet?
            </p>
            {showAnswer ? (
              <p className="mt-2 text-[10px] leading-relaxed text-foreground/75">
                Not completely. The missing explanation is intentional here; focus on the immediate goal and repeated warning.
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => setShowAnswer((value) => !value)}
            className="h-8 shrink-0 border border-amber-400/35 bg-amber-400/10 px-3 text-[10px] text-amber-300"
          >
            {showAnswer ? "Hide answer" : "Check understanding"}
          </button>
        </div>
      </div>
      <div className="flex gap-2">
        <input
          disabled
          placeholder="Ask about something you have seen…"
          aria-label="Ask a spoiler-safe question"
          className="h-9 min-w-0 flex-1 border border-border bg-input/40 px-3 text-xs placeholder:text-text-dim"
        />
        <button disabled className="h-9 border border-border px-4 text-xs text-text-dim">
          Ask
        </button>
      </div>
      <p className="text-[9px] text-muted-foreground">Spoiler-safe questions remain a prototype until the later OpenAI phase.</p>
    </div>
  );
}

function RecapCard({ icon: Icon, label, text }: { icon: LucideIcon; label: string; text: string }) {
  return (
    <div className="border border-border bg-background/45 p-3">
      <p className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.14em] text-accent">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </p>
      <p className="mt-2 text-[10px] leading-relaxed text-foreground/75">{text}</p>
    </div>
  );
}
