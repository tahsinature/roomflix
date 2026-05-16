import { useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { Database, HelpCircle, Library as LibraryIcon, LogOut, Menu, SlidersHorizontal, Users2, X } from "lucide-react";
import { AccountMenu } from "@/components/AccountMenu";
import { ViewerPill } from "@/components/ViewerPill";
import { useAuth } from "@/auth/AuthContext";
import { cn } from "@/lib/utils";

// className helper for desktop top-level nav links. Active = accent
// color so the user sees at a glance which page they're on.
const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    "text-[13px] transition hover:text-foreground",
    isActive ? "text-accent" : "text-muted-foreground",
  );

// Single, app-wide top nav. Mounted once via AuthedLayout above the
// router outlet so it doesn't re-mount during navigation — width and
// state stay stable as you move between pages. Anything page-specific
// (titles, contextual actions) belongs in a per-page secondary header
// below the body.
//
// Everything in here pulls from context — no props from the host page.
// That's deliberate: it's the same nav everywhere.
export function AppNav() {
  const { user, guest, isGuest, identityLabel, logout } = useAuth();
  const meId = user?.id ?? guest?.id ?? null;
  const location = useLocation();
  const onHome = location.pathname === "/";
  const [mobileOpen, setMobileOpen] = useState(false);

  const username = user?.username ?? null;
  const displayName = user?.displayName ?? null;
  const label = displayName?.trim() ? displayName : username ? `@${username}` : identityLabel || null;

  return (
    <>
      <nav className="fixed inset-x-0 top-0 z-40 border-b border-border bg-background/70 backdrop-blur-xl backdrop-saturate-150">
        <div className="flex items-center justify-between px-5 py-3.5 sm:px-8">
          <Link
            to="/"
            className={cn(
              "flex items-center gap-2.5 transition hover:opacity-80",
              onHome ? "text-accent" : "text-foreground",
            )}
            aria-current={onHome ? "page" : undefined}
          >
            <BrandMark />
            <span className="text-[15px] font-bold tracking-tight">
              Roomflix<span className="text-accent">.</span>
            </span>
          </Link>

          <div className="flex items-center gap-2 sm:gap-5">
            <ViewerPill meId={meId} align="right" />
            <div className="hidden items-center gap-5 sm:flex">
              <NavLink to="/library" className={navLinkClass}>
                Library
              </NavLink>
              <NavLink to="/storage" className={navLinkClass}>
                Storage
              </NavLink>
              <AccountMenu />
            </div>

            <button
              type="button"
              onClick={() => setMobileOpen((v) => !v)}
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
              aria-expanded={mobileOpen}
              className="flex h-9 w-9 items-center justify-center border border-border bg-bg-elevated/50 text-foreground transition hover:bg-bg-elevated/70 sm:hidden"
            >
              {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Mobile dropdown panel. Mirrors the AccountMenu's contents
            inline since a nested dropdown at phone widths is awkward. */}
        {mobileOpen && (
          <div className="flex flex-col border-t border-border bg-background/95 px-5 py-3 sm:hidden">
            <MobileNavLink to="/library" onClick={() => setMobileOpen(false)}>
              <LibraryIcon className="h-4 w-4 text-accent" />
              Library
            </MobileNavLink>
            <MobileNavLink to="/storage" onClick={() => setMobileOpen(false)}>
              <Database className="h-4 w-4 text-accent" />
              Storage
            </MobileNavLink>
            {!isGuest && (
              <MobileNavLink to="/settings/space" onClick={() => setMobileOpen(false)}>
                <Users2 className="h-4 w-4 text-accent" />
                Spaces
              </MobileNavLink>
            )}
            <MobileNavLink to="/help" onClick={() => setMobileOpen(false)}>
              <HelpCircle className="h-4 w-4 text-accent" />
              Help
            </MobileNavLink>
            {!isGuest && (
              <MobileNavLink to="/settings/profile" onClick={() => setMobileOpen(false)}>
                <SlidersHorizontal className="h-4 w-4 text-accent" />
                Settings
              </MobileNavLink>
            )}
            {label && (
              <div className="flex items-center justify-between border-t border-border py-3 text-left text-sm text-foreground">
                <span className={cn("truncate font-mono text-[13px] text-text-dim", isGuest && "italic")}>{label}</span>
              </div>
            )}
            <button
              type="button"
              onClick={() => {
                setMobileOpen(false);
                void logout();
              }}
              className="flex items-center gap-2 border-t border-border py-3 text-left text-sm text-text-dim transition hover:text-foreground"
            >
              <LogOut className="h-3.5 w-3.5" />
              {isGuest ? "Leave session" : "Sign out"}
            </button>
          </div>
        )}
      </nav>
    </>
  );
}

function MobileNavLink({ to, onClick, children }: { to: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      onClick={onClick}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-2 border-b border-border py-3 text-sm transition",
          isActive ? "text-accent" : "text-foreground hover:text-accent",
        )
      }
    >
      {children}
    </NavLink>
  );
}

function BrandMark() {
  return (
    <span className="relative inline-flex h-7 w-7 items-center justify-center border border-accent/40 bg-accent/10 shadow-[0_0_18px_hsl(0_100%_65%/0.25)]">
      <span
        className="block h-0 w-0 border-y-[5px] border-l-[7px] border-y-transparent border-l-accent"
        style={{ marginLeft: "1.5px" }}
        aria-hidden
      />
    </span>
  );
}
