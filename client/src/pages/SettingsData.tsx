import { DatabaseBackup, ShieldCheck } from "lucide-react";
import { WatchBridgeImportButton } from "@/features/migration/WatchBridgeImportButton";

export default function SettingsData() {
  return (
    <div className="flex flex-col gap-6">
      <section>
        <header className="mb-3">
          <span className="section-label muted">Migration</span>
          <p className="mt-1 font-mono text-[11px] text-text-dim">One-time tools for retiring the standalone WatchBridge app.</p>
        </header>

        <div className="border border-border bg-bg-elevated/40 p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-xl">
              <div className="flex items-center gap-2">
                <DatabaseBackup className="h-4 w-4 text-accent" />
                <h2 className="text-sm font-semibold">Import WatchBridge library</h2>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                Select a WatchBridge JSON backup to move its shortlist, watched titles, ratings, notes and watched dates into your Roomflix account.
              </p>
            </div>
            <WatchBridgeImportButton />
          </div>

          <div className="mt-5 flex gap-2 border-t border-border pt-4 text-[10px] leading-relaxed text-cyan">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            TMDB keys, custom actions, browser settings and recent-search history are deliberately ignored. Existing Roomflix titles with the same TMDB identity are updated, not
            duplicated.
          </div>
        </div>
      </section>
    </div>
  );
}
