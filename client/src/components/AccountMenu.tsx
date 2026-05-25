import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ChevronDown, History as HistoryIcon, Link2, LogOut, Radio, SlidersHorizontal, Users2 } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

// Identity menu in the top nav. Now strictly identity-shaped:
//   - Identity card (name + role)
//   - Settings (members only)
//   - Sign out / leave session
//
// Space switching used to live here too; it moved to SpaceChip (next
// to the brand) so there's one canonical place to read or change the
// current space. Guests get a static "you're in <space>" line.
export function AccountMenu({ className }: { className?: string }) {
  const { user, guest, isGuest, identityLabel, currentSpace, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const location = useLocation();

  // Active when the user is on a route this menu "owns" — i.e. one of
  // its internal links is the current page. /settings (which now hosts
  // the spaces hub too) is the main one. Keeps the trigger highlighted
  // so the user always knows where their current page lives in the nav.
  const isActive = location.pathname.startsWith("/settings");

  // Close on real outside click (not window blur) and Escape — mirrors
  // the ViewerPill behavior so multi-window testing isn't disrupted.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const root = rootRef.current;
      if (!root) return;
      if (e.target instanceof Node && !root.contains(e.target)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!user && !guest) return null;

  const displayName = user?.displayName?.trim();
  const username = user?.username;
  const triggerLabel = displayName || (username ? `@${username}` : identityLabel || "Account");

  return (
    <div ref={rootRef} className={cn("relative inline-flex", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn("inline-flex max-w-[12rem] items-center gap-1.5 truncate font-mono text-[12px] transition", isActive ? "text-accent" : "text-text-dim hover:text-foreground")}
        title={isGuest ? `Guest — ${triggerLabel}` : `Signed in as ${triggerLabel}`}
      >
        <span className={cn("truncate", isGuest && "italic")}>{triggerLabel}</span>
        <ChevronDown className={cn("h-3 w-3 transition", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute right-0 top-8 z-40 min-w-[16rem] border border-border bg-bg-elevated/95 shadow-[0_12px_32px_-12px_rgba(0,0,0,0.7)] backdrop-blur-xl" role="menu">
          {/* Identity card. Larger name + role tag so the menu opens
              with a clear "you are here" anchor before action rows. */}
          <div className="border-b border-border px-3 py-2.5">
            <div className={cn("truncate text-sm font-medium text-foreground", isGuest && "italic")}>{triggerLabel}</div>
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-dim">{isGuest ? "guest" : username ? `@${username}` : "member"}</div>
          </div>

          <Link
            to="/remote"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-3 py-2 text-sm text-foreground transition hover:bg-white/[0.04]"
          >
            <Radio className="h-3.5 w-3.5 text-text-dim" />
            Remote
          </Link>

          <Link
            to="/shares"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-3 py-2 text-sm text-foreground transition hover:bg-white/[0.04]"
          >
            <Link2 className="h-3.5 w-3.5 text-text-dim" />
            Shares
          </Link>

          <Link
            to="/history"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-3 py-2 text-sm text-foreground transition hover:bg-white/[0.04]"
          >
            <HistoryIcon className="h-3.5 w-3.5 text-text-dim" />
            History
          </Link>

          {!isGuest && (
            <Link
              to="/settings/profile"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2 text-sm text-foreground transition hover:bg-white/[0.04]"
            >
              <SlidersHorizontal className="h-3.5 w-3.5 text-text-dim" />
              Settings
            </Link>
          )}

          {isGuest && currentSpace && (
            // Guests can't switch spaces but it's still useful to show
            // which one they joined — same "you are here" anchor.
            <div className="border-y border-border bg-white/[0.02] px-3 py-2 text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <Users2 className="h-3.5 w-3.5 text-text-dim" />
                <span className="truncate">
                  In <span className="text-foreground">{currentSpace.name}</span>
                </span>
              </div>
            </div>
          )}

          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setOpen(false);
              void logout();
            }}
            className="flex w-full items-center gap-2 border-t border-border px-3 py-2 text-left text-sm text-text-dim transition hover:bg-white/[0.04] hover:text-foreground"
          >
            <LogOut className="h-3.5 w-3.5" />
            {isGuest ? "Leave session" : "Sign out"}
          </button>

          {open && <VersionRow />}
        </div>
      )}
    </div>
  );
}

// Footer line: app version (from package.json) + server uptime.
// Fetched once when the menu first opens; cached for the session.
function VersionRow() {
  const [info, setInfo] = useState<{ version: string; startedAt: string } | null>(null);
  useEffect(() => {
    let cancelled = false;
    api
      .getVersion()
      .then((v) => {
        if (!cancelled) setInfo(v);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  if (!info) return null;
  const started = new Date(info.startedAt);
  return (
    <div
      className="flex items-baseline justify-between gap-2 border-t border-border px-3 py-1.5 font-mono text-[10px] text-text-dim"
      title={`Server started: ${started.toLocaleString()}`}
    >
      <span>v {info.version}</span>
      <span>up {uptime(started)}</span>
    </div>
  );
}

// Short uptime label — minutes / hours / days. The server tracks its
// own start time; this just formats the diff against now.
function uptime(startedAt: Date): string {
  const diff = Date.now() - startedAt.getTime();
  if (diff < 60_000) return "just now";
  if (diff < 60 * 60_000) return `${Math.round(diff / 60_000)}m`;
  if (diff < 24 * 60 * 60_000) return `${Math.round(diff / 3_600_000)}h`;
  return `${Math.round(diff / 86_400_000)}d`;
}
