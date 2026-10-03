import { GitCompareArrows } from "lucide-react";
import { cn } from "@/lib/utils";
import { useComparison } from "./ComparisonProvider";

export function ComparisonIndicator({ titleId, compact = false }: { titleId: string; compact?: boolean }) {
  const { addedIds } = useComparison();
  if (!addedIds.has(titleId)) return null;

  return (
    <span
      role="img"
      aria-label="In your comparison list"
      title="In your comparison list"
      className={cn(
        "absolute z-10 grid place-items-center rounded-[4px] border border-accent/40 bg-black/85 text-accent shadow-sm",
        compact ? "bottom-0.5 right-0.5 size-3.5" : "bottom-1.5 right-1.5 size-5",
      )}
    >
      <GitCompareArrows className={compact ? "size-2.5" : "size-3"} aria-hidden="true" />
    </span>
  );
}
