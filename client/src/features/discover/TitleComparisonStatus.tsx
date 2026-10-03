import { Link } from "react-router-dom";
import { GitCompareArrows } from "lucide-react";
import type { DiscoverTitleDetails } from "@shared/protocol";
import { useComparison } from "@/features/compare/ComparisonProvider";
import { titleIdentity } from "./discover-utils";

export function TitleComparisonStatus({ details }: { details: DiscoverTitleDetails }) {
  const { addedIds } = useComparison();
  if (!addedIds.has(titleIdentity(details))) return null;

  return (
    <Link
      to="/discover/compare"
      title="In your comparison list. View the comparison table."
      aria-label={`${details.title} is in your comparison list. View comparison table.`}
      className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-2.5 py-1 text-[8px] uppercase tracking-[0.1em] text-accent transition hover:border-accent/60 hover:bg-accent/20 focus-visible:outline-accent sm:text-[9px]"
    >
      <GitCompareArrows className="size-3" aria-hidden="true" /> In comparison
    </Link>
  );
}
