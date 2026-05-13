import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
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

function RouteFallback() {
  return <div className="px-6 py-10 text-xs text-muted-foreground">Loading…</div>;
}
