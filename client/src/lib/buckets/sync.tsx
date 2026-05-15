import { useEffect, useRef } from "react";
import { useAuth } from "@/auth/AuthContext";
import { reconcileConnection } from "@/lib/buckets/session";

// Drop-in component (renders nothing) that reconciles the cached R2
// connection with the server-side config once per page load, as soon as
// either a real user OR a guest principal is established. Guests get the
// space's config the same way — server is the source of truth and the
// browser caches it for fast subsequent paints.
export function StorageConfigSync() {
  const { user, guest } = useAuth();
  const didRun = useRef(false);

  useEffect(() => {
    if (didRun.current) return;
    if (!user && !guest) return;
    didRun.current = true;
    void reconcileConnection();
  }, [user, guest]);

  return null;
}
