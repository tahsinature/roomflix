import { NavLink, Outlet } from "react-router-dom";
import { Database, UserCircle2, Users } from "lucide-react";
import { cn } from "@/lib/utils";

// Account-level settings shell. Left rail lists section links; the
// route outlet renders the active section's content. Only Storage
// exists for now — Profile / Preferences etc. can slot in later.
//
// Distinction from /storage: anything here is account-wide (your
// connections, your profile fields, billing if ever). /storage and
// /library are the space-scoped surfaces.
export default function Settings() {
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
      <header className="flex flex-col leading-tight border-b border-border pb-5">
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Account</span>
        <h1 className="text-base font-semibold tracking-tight text-foreground">Settings</h1>
      </header>

      <div className="grid gap-6 md:grid-cols-[14rem_1fr]">
        <aside className="border-r-0 md:border-r md:border-border md:pr-6">
          <nav className="flex flex-row gap-1 overflow-x-auto md:flex-col">
            <SectionLink to="/settings/profile" icon={<UserCircle2 className="h-3.5 w-3.5" />}>
              Profile
            </SectionLink>
            <SectionLink to="/settings/space" icon={<Users className="h-3.5 w-3.5" />}>
              Space
            </SectionLink>
            <SectionLink to="/settings/storage" icon={<Database className="h-3.5 w-3.5" />}>
              Storage
            </SectionLink>
          </nav>
        </aside>
        <div>
          <Outlet />
        </div>
      </div>
    </main>
  );
}

function SectionLink({ to, icon, children }: { to: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-2 border px-3 py-2 text-sm transition",
          isActive
            ? "border-accent/40 bg-accent/10 text-foreground"
            : "border-transparent text-muted-foreground hover:bg-white/[0.04] hover:text-foreground",
        )
      }
    >
      {icon}
      {children}
    </NavLink>
  );
}
