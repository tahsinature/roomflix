import { ArrowLeft } from "lucide-react";

export function DiscoverDetailHeader({ label, onBack }: { label: string; onBack: () => void }) {
  return (
    <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:h-[4.5rem] sm:px-6">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to Discover"
          title="Back to Discover"
          className="group grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.035] text-muted-foreground shadow-[0_10px_28px_-18px_rgba(0,0,0,0.9)] transition-[color,border-color,background-color,transform] hover:-translate-x-0.5 hover:border-accent/35 hover:bg-accent/10 hover:text-accent"
        >
          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" aria-hidden="true" />
        </button>
        <div className="min-w-0 leading-none">
          <span className="block text-[8px] font-medium uppercase tracking-[0.2em] text-accent/80 sm:text-[9px]">Discover</span>
          <span className="mt-1.5 block truncate text-xs font-medium text-foreground/85 sm:text-sm">{label}</span>
        </div>
      </div>
    </header>
  );
}
