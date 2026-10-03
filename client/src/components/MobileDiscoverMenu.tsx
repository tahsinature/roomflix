import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { ChevronDown, Compass } from "lucide-react";
import { DISCOVER_SECTIONS } from "@/features/discover/discover-navigation";
import { cn } from "@/lib/utils";

export function MobileDiscoverMenu({ onNavigate }: { onNavigate: () => void }) {
  const { pathname } = useLocation();
  const isDiscover = pathname === "/discover" || pathname.startsWith("/discover/");
  const [open, setOpen] = useState(isDiscover);

  return (
    <div className="border-b border-border">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="mobile-discover-submenu"
        onClick={() => setOpen((current) => !current)}
        className={cn(
          "flex w-full items-center gap-2 py-3 text-left text-sm transition hover:text-accent focus-visible:outline-accent",
          isDiscover ? "text-accent" : "text-foreground",
        )}
      >
        <Compass className="size-4 text-accent" aria-hidden="true" />
        Discover
        <ChevronDown className={cn("ml-auto size-4 transition-transform", open && "rotate-180")} aria-hidden="true" />
      </button>
      <div id="mobile-discover-submenu" hidden={!open} className="pb-2 pl-4">
        {DISCOVER_SECTIONS.map(({ label, path, icon: Icon }) => (
          <NavLink
            key={path}
            to={path}
            end
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-2 rounded-[4px] px-2 py-2.5 text-xs focus-visible:outline-accent",
                isActive ? "bg-accent/10 text-accent" : "text-foreground hover:text-accent",
              )
            }
          >
            <Icon className="size-3.5" aria-hidden="true" /> {label}
          </NavLink>
        ))}
      </div>
    </div>
  );
}
