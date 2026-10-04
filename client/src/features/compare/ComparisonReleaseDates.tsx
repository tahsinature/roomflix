import { ArrowRight } from "lucide-react";
import { Tooltip, TooltipDetails } from "@/components/ui/tooltip";
import { comparisonFinalAirDate, formatReleaseDate, type ComparisonTitle } from "./comparison-data";

export function ComparisonReleaseDates({ title }: { title: ComparisonTitle }) {
  const finalAirDate = comparisonFinalAirDate(title);
  const first = formatReleaseDate(title.releaseDate);
  if (!finalAirDate) return <span className="text-[11px] tabular-nums text-foreground/80">{first}</span>;
  const final = formatReleaseDate(finalAirDate);
  return (
    <Tooltip content={<TooltipDetails heading="Series run" description={`First episode: ${first}`} footer={`Final episode: ${final}`} />}>
      <span className="inline-flex flex-col gap-0.5">
        <span className="flex items-center gap-1.5 whitespace-nowrap text-[11px] tabular-nums text-foreground/80">
          <span>{first}</span>
          <ArrowRight className="size-3 shrink-0 text-text-dim" aria-hidden="true" />
          <span>{final}</span>
        </span>
        <span className="text-[9px] text-muted-foreground">First / final episode</span>
      </span>
    </Tooltip>
  );
}
