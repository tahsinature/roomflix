import { Loader2 } from "lucide-react";
import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";

// Layout for the theater (/watch). Same auth gate as AuthedLayout, but it
// renders no AppNav — the watch surface is full-bleed and chrome-free, and
// owns the whole viewport. Its own in-page exit affordance returns to the
// app, so there's no global nav to bounce off of.
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

  return <Outlet />;
}
