import { useRef, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { ChevronDown, Search } from "lucide-react";
import { DISCOVER_SECTIONS } from "@/features/discover/discover-navigation";
import { useCommandPalette } from "@/features/command-palette/CommandPaletteProvider";
import { cn } from "@/lib/utils";

export function DiscoverNavMenu() {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const location = useLocation();
  const { openPalette } = useCommandPalette();

  return (
    <div
      className="relative"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          setOpen(false);
          trigger.current?.focus();
        }
        if (event.key === "ArrowDown") {
          event.preventDefault();
          if (!open) setOpen(true);
          else {
            const links = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("a, button"));
            links[(links.indexOf(document.activeElement as HTMLElement) + 1) % links.length]?.focus();
          }
        }
      }}
    >
      <button
        ref={trigger}
        type="button"
        aria-expanded={open}
        aria-controls="discover-submenu"
        onClick={() => setOpen((current) => !current)}
        className={cn("flex items-center gap-1 text-[13px] transition hover:text-foreground", location.pathname.startsWith("/discover") ? "text-accent" : "text-muted-foreground")}
      >
        Discover <ChevronDown className={cn("size-3 transition-transform", open && "rotate-180")} />
      </button>
      {open ? (
        <nav
          id="discover-submenu"
          aria-label="Discover sections"
          className="absolute right-0 top-full mt-3 w-48 rounded-[8px] border border-border-hover bg-bg-elevated p-1.5 shadow-xl"
        >
          {DISCOVER_SECTIONS.map(({ label, path, icon: Icon }) => (
            <NavLink
              key={path}
              to={path}
              end
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                cn("flex items-center gap-2.5 rounded-[4px] px-3 py-2.5 text-xs hover:bg-white/[0.04]", isActive ? "bg-accent/10 text-accent" : "text-muted-foreground")
              }
            >
              <Icon className="size-3.5" /> {label}
            </NavLink>
          ))}
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              openPalette();
            }}
            className="mt-1 flex w-full items-center gap-2.5 border-t border-border px-3 py-2.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <Search className="size-3.5" /> Search <kbd className="ml-auto text-[9px]">⌘ / Ctrl K</kbd>
          </button>
        </nav>
      ) : null}
    </div>
  );
}
