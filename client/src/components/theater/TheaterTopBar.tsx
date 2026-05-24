import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ExternalLink, LogOut, PanelRight, Radio, Replace } from "lucide-react";
import type { Viewer } from "@shared/protocol";
import { LibraryPicker } from "@/components/LibraryPicker";
import { MemberRow } from "@/components/MemberRow";
import { useAuth } from "@/auth/AuthContext";
import { useSessionPresence } from "@/auth/SessionPresence";
import { cn } from "@/lib/utils";

export type RemoteOpenMode = "sidebar" | "newWindow" | "sameWindow";

type Props = {
  title: string;
  // Short context line under the title — e.g. "Album · photo 7 / 24".
  contextLabel: string;
  viewers: Viewer[];
  connected: boolean;
  onLoadUrl: (url: string) => void;
  // Fires as the library dropdown opens/closes so the theater can hold the
  // auto-hiding chrome open while the popover is up.
  onLibraryOpenChange?: (open: boolean) => void;
  // Same idea for the watchers popover — the parent holds the chrome
  // open while the panel is showing names.
  onWatchersOpenChange?: (open: boolean) => void;
  // Video carries its own in-player Remote launcher in the control
  // bar. For audio/photo there's no player chrome to dock it into,
  // so the top bar surfaces it here when the handler is provided.
  onOpenRemote?: (mode: RemoteOpenMode) => void;
  remoteSidebarOpen?: boolean;
};

// Auto-hiding top chrome for the theater: an exit affordance, the
// now-playing summary, the live watcher list, and the library picker.
export function TheaterTopBar({
  title,
  contextLabel,
  viewers,
  connected,
  onLoadUrl,
  onLibraryOpenChange,
  onWatchersOpenChange,
  onOpenRemote,
  remoteSidebarOpen,
}: Props) {
  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/85 via-black/45 to-transparent" />
      <div className="relative flex items-start justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            to="/library"
            aria-label="Back to library"
            title="Back to your library"
            className="flex h-9 w-9 shrink-0 items-center justify-center border border-white/15 bg-black/50 text-white/85 backdrop-blur transition hover:bg-black/70 hover:text-white"
          >
            <LogOut className="h-4 w-4 rotate-180" />
          </Link>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-white/95 sm:text-base" title={title}>
              {title}
            </div>
            <div className="truncate font-mono text-[11px] uppercase tracking-[0.16em] text-white/45">{contextLabel}</div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Watchers viewers={viewers} connected={connected} onOpenChange={onWatchersOpenChange} />
          {/* Remote launcher — popover with three open modes, same as
              the in-player Radio button on video. Only rendered for
              audio + photo; video has its own launcher in the player
              control bar. */}
          {onOpenRemote && (
            <RemoteLauncher onOpen={onOpenRemote} sidebarOpen={!!remoteSidebarOpen} />
          )}
          <LibraryPicker onPick={onLoadUrl} onOpenChange={onLibraryOpenChange} />
        </div>
      </div>
    </div>
  );
}

// Compact live presence — a connection dot + a stack of viewer initials,
// click to expand into a list panel with full display names. Deliberately
// chrome-less in the collapsed state: no border, no panel, no padding,
// so it reads as a peer affordance next to the library picker rather
// than a boxed widget. The dot persists when the room is empty so the
// canvas still has a "live" tell.
function Watchers({ viewers, connected, onOpenChange }: { viewers: Viewer[]; connected: boolean; onOpenChange?: (open: boolean) => void }) {
  const shown = viewers.slice(0, 4);
  const extra = viewers.length - shown.length;
  const label = !connected ? "Reconnecting…" : viewers.length === 0 ? "No one watching" : `${viewers.length} watching`;

  // Identity context — used to label "you" and the owner crown on
  // rows. Members are pulled from the presence context so the watchers
  // list can match what the navbar's members popover shows.
  const { user, guest } = useAuth();
  const { members } = useSessionPresence();
  const meId = user?.id ?? guest?.id ?? "";
  const ownersByUserId = useMemo(() => {
    const set = new Set<string>();
    for (const m of members) if (m.role === "owner") set.add(m.userId);
    return set;
  }, [members]);

  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Notify the parent so the theater can hold the auto-hiding chrome
  // open while the popover is up.
  useEffect(() => {
    onOpenChange?.(open);
  }, [open, onOpenChange]);

  // Click-outside + Escape to dismiss. Listeners only mount while open,
  // so the opening click can't immediately close what it just opened.
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

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={label}
        aria-label={label}
        aria-expanded={open}
        className={cn(
          "flex h-9 items-center gap-2 px-1 text-white/85 transition hover:text-white",
          open && "text-white",
        )}
      >
        <span
          className={cn("inline-flex h-2 w-2 shrink-0 rounded-full", connected ? "bg-emerald-400 shadow-[0_0_8px_rgb(52_211_153/0.7)]" : "animate-pulse-soft bg-amber-300")}
          aria-hidden
        />
        {viewers.length > 0 && (
          <div className="flex items-center -space-x-1.5">
            {shown.map((v) => (
              <span
                key={v.id}
                className="flex h-6 w-6 items-center justify-center rounded-full border border-black/70 bg-accent/85 text-[10px] font-semibold uppercase text-white shadow-[0_2px_6px_rgba(0,0,0,0.45)]"
              >
                {v.displayName.trim().charAt(0) || "?"}
              </span>
            ))}
            {extra > 0 && (
              <span className="flex h-6 w-6 items-center justify-center rounded-full border border-black/70 bg-white/15 text-[10px] font-semibold text-white shadow-[0_2px_6px_rgba(0,0,0,0.45)]">+{extra}</span>
            )}
          </div>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Currently watching"
          className="absolute right-0 top-full z-50 mt-2 w-64 border border-white/15 bg-black/85 shadow-[0_12px_36px_-8px_rgba(0,0,0,0.7)] backdrop-blur-md"
        >
          <div className="flex items-baseline justify-between border-b border-white/10 px-3 py-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/45">Watching</span>
            <span className="font-mono text-[11px] text-white/70">{viewers.length}</span>
          </div>
          {viewers.length === 0 ? (
            <div className="px-3 py-5 text-center text-xs text-white/40">No one watching</div>
          ) : (
            <ul className="max-h-[60vh] overflow-y-auto py-1">
              {viewers.map((v) => (
                <MemberRow
                  key={v.id}
                  name={v.displayName}
                  isOwner={v.kind === "user" && ownersByUserId.has(v.id)}
                  isMe={v.id === meId}
                  tone={v.kind === "guest" ? "guest" : "member"}
                  subtitle={v.kind === "guest" ? "Guest" : undefined}
                />
              ))}
            </ul>
          )}
        </div>
      )}
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
