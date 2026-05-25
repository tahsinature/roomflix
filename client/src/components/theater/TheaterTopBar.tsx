import { useEffect, useRef, useState } from "react";
import { Download, ExternalLink, PanelLeftOpen, PanelRight, Radio, Replace } from "lucide-react";
import { LibraryPicker } from "@/components/LibraryPicker";
import { cn } from "@/lib/utils";

export type RemoteOpenMode = "sidebar" | "newWindow" | "sameWindow";

type Props = {
  title: string;
  // Short context line under the title — e.g. "Album · photo 7 / 24".
  contextLabel: string;
  onLoadUrl: (url: string) => void;
  // Fires as the library dropdown opens/closes so the theater can hold the
  // auto-hiding chrome open while the popover is up.
  onLibraryOpenChange?: (open: boolean) => void;
  // Video carries its own in-player Remote launcher in the control
  // bar. For audio/photo there's no player chrome to dock it into,
  // so the top bar surfaces it here when the handler is provided.
  onOpenRemote?: (mode: RemoteOpenMode) => void;
  remoteSidebarOpen?: boolean;
  // Restores the left collection panel when the user has hidden it.
  // Only provided by Watch when a collection is loaded AND the panel
  // is currently hidden — keeps the button out of view otherwise.
  onShowCollectionPanel?: () => void;
  // Download affordance for whatever's currently on screen. Omitted
  // when nothing is loaded. The `download` attribute is a hint —
  // cross-origin CDN URLs may navigate the tab instead of saving, so
  // we add target="_blank" to fall back to "open in new tab".
  downloadUrl?: string;
  downloadFilename?: string;
};

// Auto-hiding top chrome for the theater: the now-playing summary plus
// the library picker. Watcher list moved to the global nav's members
// popover; back-to-library moved to the global nav too.
export function TheaterTopBar({
  title,
  contextLabel,
  onLoadUrl,
  onLibraryOpenChange,
  onOpenRemote,
  remoteSidebarOpen,
  onShowCollectionPanel,
  downloadUrl,
  downloadFilename,
}: Props) {
  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/85 via-black/45 to-transparent" />
      <div className="relative flex items-start justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4">
        <div className="flex min-w-0 items-center gap-3">
          {/* Show-panel affordance when the left collection panel is
              hidden. Sits next to the exit chrome so it reads as a
              "panel control" rather than floating over the video. */}
          {onShowCollectionPanel && (
            <button
              type="button"
              onClick={onShowCollectionPanel}
              aria-label="Show collection panel"
              title="Show collection panel"
              className="flex h-9 w-9 shrink-0 items-center justify-center border border-white/15 bg-black/50 text-white/85 backdrop-blur transition hover:bg-black/70 hover:text-white"
            >
              <PanelLeftOpen className="h-4 w-4" />
            </button>
          )}
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-white/95 sm:text-base" title={title}>
              {title}
            </div>
            <div className="truncate font-mono text-[11px] uppercase tracking-[0.16em] text-white/45">{contextLabel}</div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {/* Remote launcher — popover with three open modes, same as
              the in-player Radio button on video. Only rendered for
              audio + photo; video has its own launcher in the player
              control bar. */}
          {onOpenRemote && (
            <RemoteLauncher onOpen={onOpenRemote} sidebarOpen={!!remoteSidebarOpen} />
          )}
          {/* Explicit download affordance — the URL is also reachable
              via the browser's right-click / long-press menu, but a
              visible button makes the path discoverable on touch. */}
          {downloadUrl && (
            <a
              href={downloadUrl}
              download={downloadFilename || ""}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Download"
              title="Download"
              className="flex h-9 w-9 shrink-0 items-center justify-center border border-white/15 bg-black/50 text-white/85 backdrop-blur transition hover:bg-black/70 hover:text-white"
            >
              <Download className="h-4 w-4" />
            </a>
          )}
          <LibraryPicker onPick={onLoadUrl} onOpenChange={onLibraryOpenChange} />
        </div>
      </div>
    </div>
  );
}

// Three-mode Remote launcher for the top chrome. Mirrors the in-player
// version in Controls.tsx — sidebar / new window / replace-this-tab —
// so audio + photo viewers get the same affordance as video viewers
// do via the player control bar.
function RemoteLauncher({ onOpen, sidebarOpen }: { onOpen: (mode: RemoteOpenMode) => void; sidebarOpen: boolean }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node | null)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const pick = (mode: RemoteOpenMode) => {
    onOpen(mode);
    setOpen(false);
  };

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Open chat"
        title="Open chat (C)"
        className={cn(
          "inline-flex h-9 w-9 items-center justify-center gap-1.5 border text-sm font-medium backdrop-blur transition lg:w-auto lg:px-3",
          open || sidebarOpen ? "border-accent/50 bg-accent/15 text-accent" : "border-white/15 bg-black/50 text-white/85 hover:bg-black/70 hover:text-white",
        )}
      >
        <Radio className="h-3.5 w-3.5" />
        <span className="hidden lg:inline">Remote</span>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-50 mt-2 w-56 border border-white/10 bg-black/90 p-1 shadow-[0_12px_32px_-12px_rgba(0,0,0,0.7)] backdrop-blur-xl">
          <div className="border-b border-white/[0.06] px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.22em] text-white/45">Open remote</div>
          <RemoteOption icon={<PanelRight className="h-3.5 w-3.5" />} label={sidebarOpen ? "Close side panel" : "Side panel"} hint={sidebarOpen ? "Hide the sidebar" : "Dock beside the player"} onClick={() => pick("sidebar")} />
          <RemoteOption icon={<ExternalLink className="h-3.5 w-3.5" />} label="New window" hint="Detached popup — keep on a second screen" onClick={() => pick("newWindow")} />
          <RemoteOption icon={<Replace className="h-3.5 w-3.5" />} label="Replace this tab" hint="Navigate this tab to /remote" onClick={() => pick("sameWindow")} />
        </div>
      )}
    </div>
  );
}

function RemoteOption({ icon, label, hint, onClick }: { icon: React.ReactNode; label: string; hint: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-start gap-2.5 px-2.5 py-2 text-left text-sm text-white/90 transition hover:bg-white/[0.06]"
    >
      <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center text-accent">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block leading-tight">{label}</span>
        <span className="mt-0.5 block font-mono text-[10px] text-white/45">{hint}</span>
      </span>
    </button>
  );
}
