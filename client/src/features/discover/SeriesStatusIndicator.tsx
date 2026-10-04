import { Tooltip, TooltipDetails } from "@/components/ui/tooltip";
import { CalendarClock, CircleCheck, CircleHelp, CircleX, Repeat2 } from "lucide-react";
import type { DiscoverSeriesStatus } from "@shared/protocol";
import { cn } from "@/lib/utils";
import { seriesAirDates } from "./series-air-dates";
import { seriesCountSummary, seriesStatusPresentation } from "./series-status";

const icons = { returning: Repeat2, ended: CircleCheck, cancelled: CircleX, upcoming: CalendarClock, unknown: CircleHelp };

export function SeriesStatusIndicator({ data, labelled = false, className }: { data: DiscoverSeriesStatus; labelled?: boolean; className?: string }) {
  const status = seriesStatusPresentation(data);
  const Icon = icons[status.icon];
  const counts = seriesCountSummary(data);
  const dates = seriesAirDates(data);
  const next = status.nextLabel ?? (status.active ? "Next episode date unknown" : null);
  const dateFormatter = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  const firstLabel = dates.first ? `First episode: ${dateFormatter.format(new Date(dates.first))}` : null;
  const finalLabel = dates.final ? `Final episode: ${dateFormatter.format(new Date(dates.final))}` : null;
  return (
    <Tooltip
      content={
        <TooltipDetails
          heading={status.label}
          tone={status.color}
          description={status.description}
          footer={
            counts || firstLabel || finalLabel || next ? (
              <span className="flex flex-col gap-1">
                {[counts, firstLabel, finalLabel, next].filter(Boolean).map((label) => (
                  <span key={label}>{label}</span>
                ))}
              </span>
            ) : undefined
          }
        />
      }
    >
      <span
        role={labelled ? undefined : "img"}
        aria-label={labelled ? undefined : [status.tooltip, counts, firstLabel, finalLabel].filter(Boolean).join(" · ")}
        className={cn(
          "inline-flex shrink-0 items-center gap-1.5",
          status.color,
          labelled ? "flex-wrap rounded-full border border-white/15 bg-black/25 px-2.5 py-1 text-[9px]" : "",
          className,
        )}
      >
        <Icon className="!size-3" aria-hidden="true" />
        {labelled ? (
          <>
            <span>{status.label}</span>
            {status.active ? <span className="text-muted-foreground">· {status.nextLabel ?? "Next date unknown"}</span> : null}
          </>
        ) : null}
      </span>
    </Tooltip>
  );
}
