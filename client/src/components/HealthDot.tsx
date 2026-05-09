import type { HealthStatus } from "@shared/protocol";
import { cn } from "@/lib/utils";

// Tiny 8px dot summarizing a URL's reachability. Tooltip explains the state.
//   ok          → green, glowing
//   gone        → red
//   unverified  → amber (host blocked HEAD; not a definitive failure)
//   undefined   → grey, "not yet checked"
export function HealthDot({ status }: { status?: HealthStatus }) {
  const meta = (() => {
    switch (status) {
      case "ok":
        return {
          color: "bg-emerald-400 shadow-[0_0_6px_rgb(52_211_153/0.7)]",
          label: "Reachable",
        };
      case "gone":
        return { color: "bg-red-400", label: "Unreachable" };
      case "unverified":
        return { color: "bg-amber-300/80", label: "Couldn't verify" };
      default:
        return { color: "bg-white/20", label: "Not yet checked" };
    }
  })();
  return (
    <span
      className={cn("h-2 w-2 shrink-0 rounded-full", meta.color)}
      title={meta.label}
      aria-label={meta.label}
    />
  );
}
