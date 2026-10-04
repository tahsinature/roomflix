import { Tooltip } from "@/components/ui/tooltip";
import { GitCompareArrows } from "lucide-react";
import type { TitleLibraryStatus } from "@shared/protocol";
import { cn } from "@/lib/utils";
import { useComparison } from "@/features/compare/ComparisonProvider";
import { TitleStatusTooltip } from "./TitleStatusTooltip";
import { TITLE_LIBRARY_STATUSES } from "./title-status";

export function TitleStatusIndicators({
  titleId,
  status,
  statusAt,
  compact = false,
  inline = false,
}: {
  titleId: string;
  status?: TitleLibraryStatus;
  statusAt?: number | null;
  compact?: boolean;
  inline?: boolean;
}) {
  const { addedIds, addedAtById } = useComparison();
  const inComparison = addedIds.has(titleId);
  const libraryStatus = status ? TITLE_LIBRARY_STATUSES[status] : null;
  if (!libraryStatus && !inComparison) return null;
  const indicatorClass = cn(
    "grid place-items-center border border-white/20 bg-black/85 shadow-sm",
    compact ? (inline ? "size-3.5 rounded-[3px]" : "size-3 rounded-[2px]") : "size-5 rounded-[4px]",
  );
  const iconClass = compact ? (inline ? "!size-2.5" : "!size-2") : "size-3";

  return (
    <span
      className={cn(
        "flex",
        inline ? "shrink-0 flex-row items-center gap-1" : cn("absolute z-10 flex-col", compact ? "bottom-0.5 right-0.5 gap-0.5" : "bottom-1.5 right-1.5 gap-1"),
      )}
    >
      {libraryStatus ? (
        <Tooltip content={<TitleStatusTooltip action={libraryStatus.action} timestamp={statusAt} tone={libraryStatus.color} />}>
          <span role="img" aria-label={libraryStatus.label} className={cn(indicatorClass, libraryStatus.color)}>
            <libraryStatus.icon className={iconClass} aria-hidden="true" />
          </span>
        </Tooltip>
      ) : null}
      {inComparison ? (
        <Tooltip content={<TitleStatusTooltip action="Added to comparison" timestamp={addedAtById.get(titleId)} tone="text-accent" />}>
          <span role="img" aria-label="In your comparison list" className={cn(indicatorClass, "border-accent/40 text-accent")}>
            <GitCompareArrows className={iconClass} aria-hidden="true" />
          </span>
        </Tooltip>
      ) : null}
    </span>
  );
}
