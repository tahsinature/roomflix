import { Link } from "react-router-dom";
import type { ReactNode } from "react";

// Shared page chrome for /login, /register, and the password-reset
// pages — background orbs, brand mark, centered card with title and
// subtitle. The page body sits in the `children` slot.
export function AuthChrome({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center px-6 py-12">
      <BackgroundOrbs />
      <Link to="/" className="absolute left-6 top-6 flex items-center gap-2.5 text-foreground transition hover:opacity-80">
        <BrandMark />
        <span className="text-[15px] font-bold tracking-tight">
          Roomflix<span className="text-accent">.</span>
        </span>
      </Link>

      <div className="w-full max-w-sm">
        <h1 className="text-balance text-[32px] font-bold leading-[1.1] tracking-tightest sm:text-[36px]">{title}</h1>
        <p className="mt-3 text-[15px] leading-[1.6] text-muted-foreground">{subtitle}</p>
        {children}
      </div>
    </main>
  );
}

function BackgroundOrbs() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="glow-orb glow-orb-coral absolute -right-32 -top-40 h-[36rem] w-[36rem]" />
      <div className="glow-orb glow-orb-indigo absolute -left-40 top-[30%] h-[32rem] w-[32rem]" />
    </div>
  );
}

function BrandMark() {
  return (
    <span className="relative inline-flex h-7 w-7 items-center justify-center border border-accent/40 bg-accent/10 shadow-[0_0_18px_hsl(0_100%_65%/0.25)]">
      <span className="block h-0 w-0 border-y-[5px] border-l-[7px] border-y-transparent border-l-accent" style={{ marginLeft: "1.5px" }} aria-hidden />
    </span>
  );
}
