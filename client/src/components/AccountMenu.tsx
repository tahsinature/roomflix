import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ChevronDown, History as HistoryIcon, Link2, LogOut, Radio, SlidersHorizontal, Users2 } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { api } from "@/lib/api";
import { BUILT_AT, SHA } from "@/lib/version";
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

// Tiny footer line with the build SHA + how long ago it was built.
// Reads from the client bundle's stamped version constants directly so
// it always renders even if /api/version is unreachable (e.g. when
// the server hasn't been restarted since the last stamp). Also fetches
// the server's version in the background to detect a stale tab —
// surfaces a small "refresh" hint when the bundle's SHA doesn't match
// what the server is now serving.
function VersionRow() {
  const built = new Date(BUILT_AT);
  const isReal = SHA !== "dev" && Number.isFinite(built.getTime()) && built.getTime() > 1_000_000_000_000;
  const [serverSha, setServerSha] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    api
      .getVersion()
      .then((v) => {
        if (!cancelled) setServerSha(v.sha);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  const stale = isReal && serverSha && serverSha !== SHA;
  return (
    <div
      className="flex items-baseline justify-between gap-2 border-t border-border px-3 py-1.5 font-mono text-[10px] text-text-dim"
      title={isReal ? `Build ${SHA}\nBuilt: ${built.toLocaleString()}${stale ? `\nServer is on ${serverSha} — refresh for the latest.` : ""}` : "Local dev build"}
    >
      <span>v {SHA}</span>
      <span className="flex items-center gap-1.5">
        {stale && <span className="border border-amber-300/40 bg-amber-300/10 px-1 text-amber-300">refresh</span>}
        {isReal && <span>{relativeAge(built)}</span>}
      </span>
    </div>
  );
}

// "2m ago" / "3h ago" / "4d ago". Bigger units past a week so the
// footer doesn't read "153d ago" — anything older than a week shows
// the absolute month/day.
function relativeAge(d: Date): string {
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return "just now";
  if (diff < 60 * 60_000) return `${Math.round(diff / 60_000)}m ago`;
  if (diff < 24 * 60 * 60_000) return `${Math.round(diff / 3_600_000)}h ago`;
  if (diff < 7 * 24 * 60 * 60_000) return `${Math.round(diff / 86_400_000)}d ago`;
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}
