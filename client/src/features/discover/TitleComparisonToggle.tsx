import { GitCompareArrows, Loader2 } from "lucide-react";
import type { DiscoverTitleDetails } from "@shared/protocol";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/Toast";
import { useComparison } from "@/features/compare/ComparisonProvider";
import { titleIdentity } from "./discover-utils";

export function TitleComparisonToggle({ details }: { details: DiscoverTitleDetails }) {
  const { addedIds, addingIds, addSelection, removeTitle, enabled } = useComparison();
  const toast = useToast();
  const id = titleIdentity(details);
  const added = addedIds.has(id);
  const adding = addingIds.has(id);

  const toggle = async () => {
    if (added) {
      removeTitle(id);
      return;
    }
    try {
      await addSelection(details);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add this title to comparison.");
    }
  };

  return (
    <Button
      size="sm"
      variant={added ? "accent" : "outline"}
      disabled={!enabled || adding}
      onClick={() => void toggle()}
      aria-pressed={added}
      title={added ? "In your comparison list. Click to remove." : "Add this title to your comparison list."}
      className="w-full sm:w-auto"
    >
      {adding ? <Loader2 className="size-3.5 animate-spin" /> : <GitCompareArrows className="size-3.5" />}
      {adding ? "Adding to comparison…" : added ? "Remove from comparison" : "Add to comparison"}
    </Button>
  );
}
