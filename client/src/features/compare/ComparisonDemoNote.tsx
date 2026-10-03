import { Info } from "lucide-react";

const demoNote = "IMDb ratings and vote counts are simulated demo data. Other details come from TMDB.";

export function ComparisonDemoNote() {
  return (
    <>
      <details className="relative col-start-2 row-start-1 justify-self-end sm:hidden">
        <summary
          aria-label="About demo IMDb data"
          className="grid size-6 cursor-pointer list-none place-items-center rounded-[4px] text-amber-200/80 focus-visible:outline-accent [&::-webkit-details-marker]:hidden"
        >
          <Info className="size-3" aria-hidden="true" />
        </summary>
        <p className="absolute left-[-5rem] top-[calc(100%+0.5rem)] z-30 w-56 rounded-[8px] border border-border-hover bg-bg-elevated px-3 py-2 text-[10px] leading-5 text-muted-foreground shadow-lg">
          {demoNote}
        </p>
      </details>
      <span tabIndex={0} title={demoNote} aria-label={demoNote} className="hidden cursor-help text-[9px] text-amber-200/80 sm:order-2 sm:inline">
        <Info className="mr-1 inline size-3" /> Demo IMDb
      </span>
    </>
  );
}
