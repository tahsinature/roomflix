import { cn, formatBytes } from "@/lib/utils";

// Horizontal bar showing used/maxBytes. Amber past 80%, coral past 95% so
// the user notices before an upload starts failing the cap check.
export function UsageBar({ usedBytes, maxBytes, objects }: { usedBytes: number; maxBytes: number; objects: number }) {
  const ratio = maxBytes > 0 ? Math.min(usedBytes / maxBytes, 1) : 0;
  const pct = Math.round(ratio * 100);
  const tone = ratio >= 0.95 ? "danger" : ratio >= 0.8 ? "warn" : "ok";

  return (
    <div className="border border-border bg-bg-elevated/40 p-4">
      <div className="flex items-baseline justify-between text-xs">
        <span className="section-label muted">Bucket usage</span>
        <span className="font-mono text-text-dim">
          {objects} {objects === 1 ? "object" : "objects"}
        </span>
      </div>
      <div className="mt-3 h-1.5 w-full bg-white/[0.04]">
        <div
          className={cn(
            "h-full transition-all duration-500",
            tone === "ok" && "bg-live",
            tone === "warn" && "bg-amber-300",
            tone === "danger" && "bg-accent",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-2 flex items-baseline justify-between font-mono text-[11px]">
        <span className="text-foreground/80">
          {formatBytes(usedBytes)} <span className="text-text-dim">/ {formatBytes(maxBytes)}</span>
        </span>
        <span className={cn(tone === "ok" && "text-muted-foreground", tone === "warn" && "text-amber-300", tone === "danger" && "text-accent")}>{pct}%</span>
      </div>
    </div>
  );
}
