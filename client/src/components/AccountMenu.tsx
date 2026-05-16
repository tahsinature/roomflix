import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Check, ChevronDown, LogOut, SlidersHorizontal, Users2 } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { cn } from "@/lib/utils";

// Unified identity menu in the top nav. Combines:
//   - Profile (edit display name)
//   - Space switching + manage spaces (members only)
//   - Sign out / leave session
// One trigger, one dropdown — replaces the prior trio of SpaceSwitcher
// button + identity button + logout icon. Guests get a simplified
// version: identity row + leave session only (they can't manage spaces
// or edit a persistent profile).
export function AccountMenu({ className }: { className?: string }) {
  const { user, guest, isGuest, identityLabel, currentSpace, spaces, switchSpace, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
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

  const handleSwitch = async (id: string) => {
    if (id === currentSpace?.id) {
      setOpen(false);
      return;
    }
    setOpen(false);
    await switchSpace(id);
    // Re-mount the current route so its data refetches under the new
    // space's storage. navigate(0) replays the entry without a hard
    // reload — same trick SpaceSwitcher used.
    navigate(0);
  };

  return (
    <div ref={rootRef} className={cn("relative inline-flex", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          "inline-flex max-w-[12rem] items-center gap-1.5 truncate font-mono text-[12px] transition",
          isActive ? "text-accent" : "text-text-dim hover:text-foreground",
        )}
        title={isGuest ? `Guest — ${triggerLabel}` : `Signed in as ${triggerLabel}`}
      >
        <span className={cn("truncate", isGuest && "italic")}>{triggerLabel}</span>
        <ChevronDown className={cn("h-3 w-3 transition", open && "rotate-180")} />
      </button>

      {open && (
        <div
          className="absolute right-0 top-8 z-40 min-w-[16rem] border border-border bg-bg-elevated/95 shadow-[0_12px_32px_-12px_rgba(0,0,0,0.7)] backdrop-blur-xl"
          role="menu"
        >
          {/* Identity card. Larger name + role tag so the menu opens
              with a clear "you are here" anchor before action rows. */}
          <div className="border-b border-border px-3 py-2.5">
            <div className={cn("truncate text-sm font-medium text-foreground", isGuest && "italic")}>{triggerLabel}</div>
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-dim">
              {isGuest ? "guest" : username ? `@${username}` : "member"}
            </div>
          </div>

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

          {!isGuest && (
            <>
              <div className="mt-1 border-t border-border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-text-dim">
                Spaces
              </div>
              <ul className="max-h-60 overflow-y-auto">
                {spaces.map((s) => {
                  const active = s.id === currentSpace?.id;
                  return (
                    <li key={s.id}>
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => void handleSwitch(s.id)}
                        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition hover:bg-white/[0.04]"
                      >
                        <span className={cn("min-w-0 flex-1 truncate", active ? "text-foreground" : "text-muted-foreground")}>{s.name}</span>
                        {s.role === "owner" && <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-dim">owner</span>}
                        {active && <Check className="h-3.5 w-3.5 text-accent" />}
                      </button>
                    </li>
                  );
                })}
                {spaces.length === 0 && (
                  // Onboarding path: zero spaces. Sends them to the
                  // hub where create/redeem live, since the menu no
                  // longer hosts those CTAs directly.
                  <li>
                    <Link
                      to="/settings/space"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground transition hover:bg-white/[0.04] hover:text-foreground"
                    >
                      You're not in any space yet — set one up.
                    </Link>
                  </li>
                )}
              </ul>
            </>
          )}

          {isGuest && currentSpace && (
            // Guests can't switch spaces but it's still useful to show
            // which one they joined — same "you are here" anchor.
            <div className="border-y border-border bg-white/[0.02] px-3 py-2 text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <Users2 className="h-3.5 w-3.5 text-text-dim" />
                <span className="truncate">In <span className="text-foreground">{currentSpace.name}</span></span>
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
        </div>
      )}
    </div>
  );
}
