import { useEffect } from "react";
import { ArrowRight, HardDrive } from "lucide-react";
import { useCommandPalette } from "@/features/command-palette/CommandPaletteProvider";
import { ComparisonTable } from "@/features/compare/ComparisonTable";
import { useComparison } from "@/features/compare/ComparisonProvider";

export default function Compare() {
  const { titles, removeTitle, moveTitle, refreshTitles, storageError } = useComparison();
  const { openComparisonSearch } = useCommandPalette();

  useEffect(() => {
    void refreshTitles();
  }, [refreshTitles]);

  return (
    <main className="view-enter mx-auto max-w-[90rem] px-4 pb-12 pt-6 sm:px-8 sm:pt-8 lg:px-12">
      <section aria-label="Your comparison list" className="overflow-hidden rounded-[12px] border border-border-hover bg-card/65 shadow-[0_24px_80px_-40px_rgba(0,0,0,0.65)]">
        <ComparisonTable titles={titles} onRemove={(title) => removeTitle(title.id)} onAdd={openComparisonSearch} onMove={moveTitle} />
      </section>

      <footer className="mt-4 flex flex-wrap items-center justify-between gap-3 px-1 text-[9px] leading-5 text-muted-foreground">
        <p role={storageError ? "alert" : undefined} className="flex items-center gap-1.5">
          <HardDrive className="size-3" />
          {storageError ? "Browser storage is unavailable. This list will only last for this visit." : "Saved in this browser for your account."}
        </p>
        <p className="flex items-center gap-1.5 sm:hidden">
          Swipe the table to compare
          <ArrowRight className="size-3" />
        </p>
        <p className="hidden sm:block">Your comparison list is separate from your watchlist.</p>
      </footer>
    </main>
  );
}
