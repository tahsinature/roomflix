import { Loader2 } from "lucide-react";
import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { AppNav } from "@/components/AppNav";

// Layout for the theater (/watch). Same auth gate as AuthedLayout and
// the same global nav at the top — Watch was originally designed
// chrome-free, but having the nav visible in non-fullscreen makes it
// easier to bounce between Library, Storage, etc. without going
// through the theater's own exit affordance. In fullscreen the browser
// covers the nav with the fullscreen element, so this doesn't fight
// the immersive mode.
//
// Embedded mode (the iframe-as-sidebar use case): the nav is
// AppNav-suppressed because the host page already provides it; that
// detection lives in AppNav itself.
export function TheaterLayout() {
  const { user, guest, loading } = useAuth();

  if (loading) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-black px-6 text-center">
        <Loader2 className="h-7 w-7 animate-spin text-accent/90" />
        <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Loading…</span>
      </main>
    );
  }
  if (!user && !guest) return <Navigate to="/welcome" replace />;

  const embedded = typeof window !== "undefined" && window.self !== window.top;

  return (
    <>
      {!embedded && <AppNav />}
      <div className={embedded ? "h-[100dvh]" : "h-[100dvh] pt-[60px] sm:pt-[68px]"}>
        <Outlet />
      </div>
    </>
  );
}
