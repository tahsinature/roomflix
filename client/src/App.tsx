import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import { Loader2 } from "lucide-react";
import Home from "@/pages/Home";
import Room from "@/pages/Room";
import Library from "@/pages/Library";
import Help from "@/pages/Help";

// Storage carries the @aws-sdk/client-s3 dep (~250KB gz). Lazy-load so
// users who never open /storage don't pay for it on first paint.
const Storage = lazy(() => import("@/pages/Storage"));

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/library" element={<Library />} />
      <Route path="/help" element={<Help />} />
      <Route path="/room/:roomId" element={<Room />} />
      <Route
        path="/storage"
        element={
          <Suspense fallback={<RouteFallback />}>
            <Storage />
          </Suspense>
        }
      />
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
