import type { HealthStatus } from "@shared/protocol";
import { cn } from "@/lib/utils";

// Tiny 8px dot summarizing a URL's reachability. Tooltip explains the state.
// Available URLs are full-saturation emerald; coral is reserved for confirmed
// failures. Glow signals verification confidence.
//   ok          → emerald + strong glow (verified reachable)
//   unverified  → emerald + medium glow (host blocked HEAD; presumed available)
//   undefined   → emerald + soft glow (not yet checked; assume fine)
//   gone        → coral + glow (definitively unreachable)
export function HealthDot({ status }: { status?: HealthStatus }) {
  const meta = (() => {
    switch (status) {
      case "ok":
        return { color: "bg-emerald-400 shadow-[0_0_8px_rgb(52_211_153/0.7)]", label: "Reachable" };
      case "gone":
        return { color: "bg-accent shadow-[0_0_6px_hsl(0_100%_65%/0.55)]", label: "Unreachable" };
      case "unverified":
        return { color: "bg-emerald-400 shadow-[0_0_6px_rgb(52_211_153/0.5)]", label: "Couldn't verify (presumed available)" };
      default:
        return { color: "bg-emerald-400 shadow-[0_0_5px_rgb(52_211_153/0.4)]", label: "Not yet checked" };
    }
  })();
  return <span className={cn("inline-block h-2 w-2 shrink-0 rounded-full", meta.color)} title={meta.label} aria-label={meta.label} />;
}
