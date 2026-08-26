import { ArrowLeft } from "lucide-react";

export function DiscoverDetailHeader({ label, onBack }: { label: string; onBack: () => void }) {
  return (
    <header className="border-b border-border bg-background/95">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:px-6">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex h-11 items-center gap-2 border border-border px-3 text-xs text-muted-foreground transition-colors hover:border-border-hover hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Discover
        </button>
        <span className="min-w-0 truncate text-[10px] uppercase tracking-[0.14em] text-text-dim">{label}</span>
      </div>
    </header>
  );
}
