import { Link } from "react-router-dom";
import { ArrowRight, Database } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/auth/AuthContext";

// Marketing landing for logged-out visitors. Logged-in users hit `/` and
// get the dashboard instead — this page lives at /welcome so it's still
// reachable for sharing or the rare logged-in user who lands here.

export default function Welcome() {
  return (
    // Flex column that fills the viewport so the footer naturally pins to
    // the bottom. The hero takes whatever vertical space is left between
    // nav and footer — on a normal-sized screen everything fits without
    // scrolling; on short screens (small laptops, landscape phones) the
    // hero just gets shorter and the page scrolls a bit.
    <main className="relative flex min-h-screen flex-col">
      <BackgroundOrbs />
      <SiteNav />

      <section className="relative flex flex-1 flex-col items-center justify-center px-6 pb-10 pt-24 text-center sm:pt-28">
        <div className="fade-up inline-flex items-center gap-2 border border-border bg-bg-elevated/40 px-3 py-1.5 text-[12px] text-muted-foreground backdrop-blur">
          <span className="inline-flex h-2 w-2 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_8px_rgb(52_211_153/0.7)]" />
          <span className="font-medium tracking-wide">live sync · your private space</span>
        </div>

        <h1 className="mt-5 max-w-3xl text-balance text-[40px] font-bold leading-[1.05] tracking-tightest sm:text-[52px] lg:text-[64px]">
          Movie nights, <em className="accent-em">miles apart.</em>
        </h1>

        <p className="fade-up-d1 mt-5 max-w-xl text-base leading-[1.6] text-muted-foreground sm:text-[16px]">
          Invite your people to a space, drop a video URL, and watch in perfect sync.{" "}
          <span className="text-foreground/85">Your library follows you, no app install required.</span>
        </p>

        <SyncPreview />
      </section>

      <SiteFooter />
    </main>
  );
}

function BackgroundOrbs() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="glow-orb glow-orb-coral absolute -right-32 -top-40 h-[36rem] w-[36rem]" />
      <div className="glow-orb glow-orb-indigo absolute -left-40 top-[30%] h-[32rem] w-[32rem]" />
      <div className="glow-orb glow-orb-cyan absolute bottom-[-10%] left-[40%] h-[24rem] w-[24rem]" />
    </div>
  );
}

function SiteNav() {
  const { user } = useAuth();
  return (
    <nav className="fade-up fixed inset-x-0 top-0 z-40 flex items-center justify-between border-b border-border bg-background/70 px-5 py-3.5 backdrop-blur-xl backdrop-saturate-150 sm:px-8">
      <Link to={user ? "/" : "/welcome"} className="flex items-center gap-2.5 text-foreground transition hover:opacity-80">
        <BrandMark />
        <span className="text-[15px] font-bold tracking-tight">
          Roomflix<span className="text-accent">.</span>
        </span>
      </Link>
      <div className="flex items-center gap-2 sm:gap-5">
        {user ? (
          <>
            <span className="hidden font-mono text-[12px] text-text-dim sm:inline">@{user.username}</span>
            <Button asChild variant="accent" size="sm">
              <Link to="/">
                Dashboard
                <ArrowRight className="h-3 w-3" />
              </Link>
            </Button>
          </>
        ) : (
          <>
            <Link to="/join" className="text-[13px] text-muted-foreground transition hover:text-foreground">
              Join as guest
            </Link>
            {/* One CTA covers sign-in + register — the /login page links
                to /register at the bottom for first-time visitors. Keeps
                the nav uncluttered without hiding either path. */}
            <Button asChild variant="accent" size="sm">
              <Link to="/login">
                Sign in
                <ArrowRight className="h-3 w-3" />
              </Link>
            </Button>
          </>
        )}
      </div>
    </nav>
  );
}

function BrandMark() {
  return (
    <span className="relative inline-flex h-7 w-7 items-center justify-center border border-accent/40 bg-accent/10 shadow-[0_0_18px_hsl(0_100%_65%/0.25)]">
      <span className="block h-0 w-0 border-y-[5px] border-l-[7px] border-y-transparent border-l-accent" style={{ marginLeft: "1.5px" }} aria-hidden />
    </span>
  );
}

function SyncPreview() {
  return (
    <div className="fade-up-d4 mt-10 w-full max-w-[640px]">
      <div className="border border-border bg-bg-elevated">
        <div className="flex items-center gap-2 border-b border-border bg-white/[0.02] px-4 py-2">
          <span className="term-dot bg-[#ff5f57]" />
          <span className="term-dot bg-[#ffbd2e]" />
          <span className="term-dot bg-[#28c840]" />
          <span className="flex-1 text-center text-[11px] text-text-dim">space://aurora-cat</span>
          <span className="text-[10px] text-text-dim opacity-0 sm:opacity-100">●REC</span>
        </div>
        <div className="space-y-1 p-4 text-left font-mono text-[13px] leading-[1.8]">
          <div className="fade-up-d1 flex items-center gap-3 text-foreground">
            <span className="text-accent">▶</span>
            <span>playing</span>
            <span className="ml-auto tabular-nums text-text-dim">00:42:18 / 01:48:00</span>
          </div>
          <div className="fade-up-d2 flex items-center gap-3 text-foreground">
            <span className="text-live">✓</span>
            <span>in sync</span>
            <span className="ml-auto tabular-nums text-text-dim">±0.04s drift</span>
          </div>
          <div className="fade-up-d3 flex items-center gap-3 text-foreground">
            <span className="text-cyan">⊙</span>
            <span>2 viewers connected</span>
            <span className="ml-auto text-text-dim">@you · @sam</span>
          </div>
          <div className="fade-up-d4 flex items-center gap-3 text-muted-foreground">
            <span className="text-text-dim">↗</span>
            <span>invited via space code</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function SiteFooter() {
  return (
    <footer className="border-t border-border px-6 py-5 text-center text-[12px] text-text-dim">
      <p className="mx-auto max-w-md leading-relaxed">
        Made for the people you watch with. <span className="text-muted-foreground">Private spaces. Direct video URLs. No tracking.</span>
      </p>
      <div className="mt-3 flex flex-wrap justify-center gap-6 text-[12px]">
        <Link to="/login" className="text-muted-foreground transition hover:text-foreground">
          Sign in
        </Link>
        <Link to="/register" className="inline-flex items-center gap-1 text-muted-foreground transition hover:text-foreground">
          <Database className="h-3 w-3" />
          Create account
        </Link>
        <Link to="/join" className="text-muted-foreground transition hover:text-foreground">
          Join as guest
        </Link>
      </div>
    </footer>
  );
}
