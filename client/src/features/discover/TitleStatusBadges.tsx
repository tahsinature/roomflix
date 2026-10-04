import { Tooltip } from "@/components/ui/tooltip";
import { Link } from "react-router-dom";
import type { DiscoverTitleDetails, TitleLibraryStatus } from "@shared/protocol";
import { cn } from "@/lib/utils";
import { TitleComparisonStatus } from "./TitleComparisonStatus";
import { TitleStatusTooltip } from "./TitleStatusTooltip";
import { TITLE_LIBRARY_STATUSES } from "./title-status";

export function TitleStatusBadges({ details, status, statusAt }: { details: DiscoverTitleDetails; status?: TitleLibraryStatus; statusAt?: number | null }) {
  const libraryStatus = status ? TITLE_LIBRARY_STATUSES[status] : null;
  return (
    <>
      {libraryStatus ? (
        <Tooltip content={<TitleStatusTooltip action={libraryStatus.action} timestamp={statusAt} tone={libraryStatus.color} hint="View list" />}>
          <Link
            to={libraryStatus.path}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-black/25 px-2.5 py-1 text-[8px] uppercase tracking-[0.1em] transition hover:border-white/40 focus-visible:outline-accent sm:text-[9px]",
              libraryStatus.color,
            )}
          >
            <libraryStatus.icon className="size-3" aria-hidden="true" />
            {libraryStatus.label}
          </Link>
        </Tooltip>
      ) : null}
      <TitleComparisonStatus details={details} />
    </>
  );
}
