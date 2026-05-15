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
// (for /spaces) still wraps individually since that's a sub-gate.
export function AuthedLayout() {
  const { user, guest, loading } = useAuth();

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
      <AppNav />
      {/* Top padding clears the fixed nav. Match this when the nav's
          height changes (currently 60px mobile / 68px desktop). Pages
          don't need to add their own top spacing. */}
      <div className="min-h-screen pt-[60px] sm:pt-[68px]">
        <Outlet />
      </div>
    </>
  );
}
