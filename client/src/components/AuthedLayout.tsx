import { Loader2 } from "lucide-react";
import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { AppNav } from "@/components/AppNav";

// Wraps every authenticated route. AppNav is mounted once at this
// level so it never re-renders during in-app navigation — Library →
// Storage → Watch all swap below it without touching the nav.
//
// Also owns the auth gate: unauthenticated visitors are bounced to
// /welcome instead of seeing a half-rendered nav. RequireRealUser
// (for /settings) still wraps individually since that's a sub-gate.
export function AuthedLayout() {
  const { user, guest, loading } = useAuth();
  // When this app is rendered inside an iframe (e.g. /remote opened as
  // a sidebar from /watch), the top nav adds chrome that doesn't fit
  // the narrower frame. Suppress it; the host page provides the
  // navigation context already.
  const embedded = typeof window !== "undefined" && window.self !== window.top;

  if (loading) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <Loader2 className="h-7 w-7 animate-spin text-accent/90" />
        <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Loading…</span>
      </main>
    );
  }
  if (!user && !guest) return <Navigate to="/welcome" replace />;

  return (
    <>
      {!embedded && <AppNav />}
      {/* Scrolling lives inside this container rather than on the
          body so the page scrollbar sits BELOW the fixed nav instead
          of running the full viewport height past it. Cleaner visual
          — the nav reads as the solid top boundary. Body's `overflow:
          hidden` (set in index.css base styles) prevents the
          double-scrollbar artifact. */}
      {/* `dvh` matches the actual visible viewport on mobile browsers
          (Chrome's URL bar collapses dynamically). Using `vh`/`screen`
          here was causing a phantom ~60px scroll-by-nav-height on
          Android Chrome. */}
      {/* overflow-x-hidden in embedded mode keeps the sidebar from
          gaining a horizontal scrollbar — any stray wide content gets
          clipped instead. Vertical scroll still flows for the
          intentional cases (chat thread, settings forms). */}
      <div
        id="app-scroll-container"
        className={embedded ? "h-[100dvh] overflow-y-auto overflow-x-hidden overscroll-y-contain" : "h-[100dvh] overflow-y-auto overscroll-y-contain pt-[60px] sm:pt-[68px]"}
      >
        <Outlet />
      </div>
    </>
  );
}
