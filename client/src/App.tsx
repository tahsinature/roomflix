import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import { Loader2 } from "lucide-react";
import Home from "@/pages/Home";
import Welcome from "@/pages/Welcome";
import Watch from "@/pages/Watch";
import Library from "@/pages/Library";
import Help from "@/pages/Help";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import Spaces from "@/pages/Spaces";
import Join from "@/pages/Join";
import { AuthedLayout } from "@/components/AuthedLayout";
import { RedirectIfAuthenticated, RequireRealUser } from "@/auth/RequireAuth";

// Storage carries the @aws-sdk/client-s3 dep (~250KB gz). Lazy-load so
// users who never open /storage don't pay for it on first paint.
const Storage = lazy(() => import("@/pages/Storage"));

export default function App() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <RedirectIfAuthenticated>
            <Login />
          </RedirectIfAuthenticated>
        }
      />
      <Route
        path="/register"
        element={
          <RedirectIfAuthenticated>
            <Register />
          </RedirectIfAuthenticated>
        }
      />
      {/* Guest join. Public — anyone can paste a code without an account. */}
      <Route
        path="/join"
        element={
          <RedirectIfAuthenticated>
            <Join />
          </RedirectIfAuthenticated>
        }
      />
      <Route
        path="/join/:code"
        element={
          <RedirectIfAuthenticated>
            <Join />
          </RedirectIfAuthenticated>
        }
      />
      {/* /welcome is the marketing landing for logged-out visitors;
          it has its own SiteNav and lives outside the authed shell. */}
      <Route path="/welcome" element={<Welcome />} />

      {/* Everything authed (including "/") shares the AppNav via
          AuthedLayout. The layout itself gates auth (redirects to
          /welcome if not signed in) and renders the nav once above
          the outlet — page transitions never remount the nav. */}
      <Route element={<AuthedLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/library" element={<Library />} />
        <Route path="/help" element={<Help />} />
        <Route
          path="/spaces"
          element={
            <RequireRealUser>
              <Spaces />
            </RequireRealUser>
          }
        />
        <Route path="/watch" element={<Watch />} />
        <Route
          path="/storage"
          element={
            <Suspense fallback={<RouteFallback />}>
              <Storage />
            </Suspense>
          }
        />
      </Route>
    </Routes>
  );
}

// Suspense fallback while a lazy route's JS chunk downloads. Centered so it
// doesn't read as broken UI in the top-left, and visually consistent with
// the other "loading" frames across the app.
function RouteFallback() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
      <Loader2 className="h-7 w-7 animate-spin text-accent/90" />
      <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Loading…</span>
    </main>
  );
}
