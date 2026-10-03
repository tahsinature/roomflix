import { Clapperboard } from "lucide-react";

export type DiscoverView = "explore" | "shortlist" | "watched" | "recent" | "compare";

export function EmptyLibrary({ view, onExplore }: { view: "shortlist" | "watched"; onExplore: () => void }) {
  return (
    <div className="border border-border bg-card/35 px-6 py-14 text-center">
      <Clapperboard className="mx-auto h-7 w-7 text-text-dim" />
      <p className="mt-3 text-sm font-semibold">Nothing {view === "watched" ? "watched" : "saved"} yet</p>
      <button type="button" onClick={onExplore} className="mt-3 text-xs text-accent underline decoration-accent/40 underline-offset-4">
        Find something worth watching
      </button>
    </div>
  );
}
