import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Check, ChevronDown, Settings, Users2 } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { cn } from "@/lib/utils";

// Current-space affordance in the top-left of the nav. Reads like a
// path ("Roomflix / TL") with the brand mark, opens a switcher popover
// on click. Designed to be the single canonical place to see + change
// which space you're in — AccountMenu no longer carries a duplicate
// switcher.
//
// Guests see a read-only chip (no switcher) since they're locked to
// the space they joined.
export function SpaceChip() {
  const { user, isGuest, currentSpace, spaces, switchSpace } = useAuth();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

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

  // No identity at all — render nothing, AppNav handles the placeholder.
  if (!user && !isGuest) return null;
  // Read-only display when there's literally no space to show. Lets the
  // user spot "I'm signed in but stranded" without the chip pretending
  // to be interactive.
  if (!currentSpace) {
    if (isGuest) return null;
    return (
      <Link
        to="/settings/space"
        className="hidden items-center gap-1.5 font-mono text-[12px] text-text-dim transition hover:text-foreground sm:inline-flex"
        title="You're not in a space yet — set one up"
      >
        <Users2 className="h-3 w-3" />
        no space
      </Link>
    );
  }

  const handleSwitch = async (id: string) => {
    setOpen(false);
    if (id === currentSpace.id) return;
    await switchSpace(id);
    // Re-mount the current route so its data refetches under the new
    // space's storage. Same trick AccountMenu used.
    navigate(0);
  };

  // Guests get a static chip — they can't switch. Use the same visual
  // shell so the nav doesn't shift when an unauth'd user signs in.
  if (isGuest) {
    return (
      <div className="hidden items-center gap-1.5 font-mono text-[12px] text-text-dim sm:inline-flex" title={`In ${currentSpace.name}`}>
        <span className="text-text-dim/60">/</span>
        <span className="max-w-[8rem] truncate text-foreground">{currentSpace.name}</span>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="relative hidden sm:inline-flex">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={`Current space: ${currentSpace.name}`}
        className="inline-flex items-center gap-1.5 font-mono text-[12px] text-text-dim transition hover:text-foreground"
      >
        <span className="text-text-dim/60">/</span>
        <span className="max-w-[10rem] truncate text-foreground">{currentSpace.name}</span>
        <ChevronDown className={cn("h-3 w-3 transition", open && "rotate-180")} />
      </button>

      {open && (
        <div role="menu" className="absolute left-0 top-8 z-40 min-w-[14rem] border border-border bg-bg-elevated/95 shadow-[0_12px_32px_-12px_rgba(0,0,0,0.7)] backdrop-blur-xl">
          <div className="border-b border-border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-text-dim">Spaces</div>
          <ul className="max-h-60 overflow-y-auto">
            {spaces.map((s) => {
              const active = s.id === currentSpace.id;
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
          </ul>
          <Link
            to="/settings/space"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 border-t border-border px-3 py-2 text-sm text-muted-foreground transition hover:bg-white/[0.04] hover:text-foreground"
          >
            <Settings className="h-3.5 w-3.5" />
            Manage spaces
          </Link>
        </div>
      )}
    </div>
  );
}
