import { Loader2 } from "lucide-react";
import { Navigate, useLocation, type Location } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "@/auth/AuthContext";

// Allow either a signed-in real user OR a guest session through. Pages
// that need an actual account (e.g. /settings) check `isGuest` themselves.
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, guest, loading } = useAuth();
  const location = useLocation();

  if (loading) return <AuthSplash />;
  if (!user && !guest) return <Navigate to="/login" state={{ from: location }} replace />;
  return <>{children}</>;
}

// Inverse of RequireAuth — used to wrap /login, /register, /join so an
// already-signed-in user gets bounced home instead of re-seeing auth pages.
export function RedirectIfAuthenticated({ children }: { children: ReactNode }) {
  const { user, guest, loading } = useAuth();
  const location = useLocation();

  if (loading) return <AuthSplash />;
  if (user || guest) {
    const from = (location.state as { from?: Location } | null)?.from;
    return <Navigate to={from?.pathname ?? "/"} replace />;
  }
  return <>{children}</>;
}

// Stricter guard: blocks guests too. Used by routes that touch
// space management or other operations only real members can perform.
export function RequireRealUser({ children, redirectTo = "/watch" }: { children: ReactNode; redirectTo?: string }) {
  const { user, loading } = useAuth();
  if (loading) return <AuthSplash />;
  if (!user) return <Navigate to={redirectTo} replace />;
  return <>{children}</>;
}

function AuthSplash() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
      <Loader2 className="h-7 w-7 animate-spin text-accent/90" />
      <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Loading…</span>
    </main>
  );
}
