import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import type { JoinRequest } from "@shared/protocol";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/auth/AuthContext";
import { api } from "@/lib/api";

// Waiting room shown after a recipient hits an invite link on a space
// whose joinPolicy = "approval". Polls /api/join-requests/:id every
// 2s until terminal:
//
//   approved → for guests, the poll response sets the session cookie;
//              we refresh AuthContext and route to /library. For users,
//              their membership is already added by the approve route,
//              same refresh+route works.
//   denied   → terminal message; "go back" link.
//   expired  → same as denied, different copy.
//   cancelled → joiner backed out; we navigate home.
//
// The request id IS the bearer credential — no auth required to poll
// (the joiner submitted the request anonymously when guesting).
export default function JoinWaiting() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [request, setRequest] = useState<JoinRequest | null>(null);
  const [error, setError] = useState("");
  const settledRef = useRef(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      try {
        const next = await api.getJoinRequest(id);
        if (cancelled) return;
        setRequest(next);
        if (next.status === "approved" && !settledRef.current) {
          settledRef.current = true;
          // The /api/join-requests/:id response for an approved guest
          // request sets the session cookie. For approved user
          // requests, the membership row was added at approve time and
          // is now reachable via the existing user session. Either way,
          // a refresh picks up the new identity / space membership.
          await refresh();
          navigate("/library", { replace: true });
          return;
        }
        if (next.status === "denied" || next.status === "expired" || next.status === "cancelled") {
          settledRef.current = true;
          return;
        }
      } catch (err) {
        if (!cancelled) setError((err as Error).message || "Couldn't check request status");
      }
      if (!cancelled && !settledRef.current) timer = setTimeout(tick, 2000);
    };

    timer = setTimeout(tick, 800);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [id, navigate, refresh]);

  const cancel = async () => {
    if (!id) return;
    try {
      await api.cancelJoinRequest(id);
    } catch {
      // Already settled or gone — fine, we still navigate.
    }
    navigate("/welcome", { replace: true });
  };

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center px-6 py-12">
      <BackgroundOrbs />
      <Link to="/welcome" className="absolute left-6 top-6 flex items-center gap-2.5 text-foreground transition hover:opacity-80">
        <BrandMark />
        <span className="text-[15px] font-bold tracking-tight">
          Roomflix<span className="text-accent">.</span>
        </span>
      </Link>

      <div className="w-full max-w-md">
        {error && <div className="mb-4 border border-accent/40 bg-accent/10 px-3 py-2 font-mono text-[12px] text-foreground">{error}</div>}
        {!request && !error && (
          <div className="text-center">
            <Loader2 className="mx-auto h-7 w-7 animate-spin text-accent/90" />
            <p className="mt-4 font-mono text-[12px] uppercase tracking-[0.22em] text-muted-foreground">Checking your request…</p>
          </div>
        )}
        {request?.status === "pending" && <PendingBody onCancel={() => void cancel()} />}
        {request?.status === "approved" && (
          <div className="text-center">
            <Loader2 className="mx-auto h-7 w-7 animate-spin text-accent/90" />
            <p className="mt-4 font-mono text-[12px] uppercase tracking-[0.22em] text-muted-foreground">Signing you in…</p>
          </div>
        )}
        {request?.status === "denied" && (
          <Terminal kind="denied" message="Your host declined the request." />
        )}
        {request?.status === "expired" && (
          <Terminal kind="expired" message="The request timed out before anyone admitted you." />
        )}
        {request?.status === "cancelled" && (
          <Terminal kind="denied" message="Request was cancelled." />
        )}
      </div>
    </main>
  );
}

function PendingBody({ onCancel }: { onCancel: () => void }) {
  return (
    <>
      <h1 className="text-balance text-center text-[28px] font-bold leading-[1.1] tracking-tightest sm:text-[32px]">
        Waiting for approval…
      </h1>
      <p className="mt-3 text-center text-[14px] leading-[1.6] text-muted-foreground">
        Your host needs to admit you before you can join. We'll sign you in automatically as soon as they do.
      </p>

      <div className="mt-8 border border-accent/40 bg-accent/10 px-6 py-6 text-center">
        <div className="flex items-center justify-center gap-2 font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Pending
        </div>
      </div>

      <button type="button" onClick={onCancel} className="mt-6 block w-full text-center text-[12px] text-text-dim transition hover:text-foreground">
        ← Cancel
      </button>
    </>
  );
}

function Terminal({ kind, message }: { kind: "denied" | "expired"; message: string }) {
  return (
    <div className="text-center">
      {kind === "expired" ? (
        <Loader2 className="mx-auto h-7 w-7 text-text-dim" />
      ) : (
        <XCircle className="mx-auto h-7 w-7 text-accent" />
      )}
      <h1 className="mt-4 text-balance text-[24px] font-bold leading-[1.1] tracking-tightest text-foreground">
        {kind === "expired" ? "Request expired." : "Request declined."}
      </h1>
      <p className="mt-3 text-[14px] text-muted-foreground">{message}</p>
      <Button asChild variant="accent" size="lg" className="mt-6 w-full text-base">
        <Link to="/welcome">
          <CheckCircle2 className="h-4 w-4" />
          Back
        </Link>
      </Button>
    </div>
  );
}

function BackgroundOrbs() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="glow-orb glow-orb-coral absolute -right-32 -top-40 h-[36rem] w-[36rem]" />
      <div className="glow-orb glow-orb-indigo absolute -left-40 top-[30%] h-[32rem] w-[32rem]" />
    </div>
  );
}

function BrandMark() {
  return (
    <span className="relative inline-flex h-7 w-7 items-center justify-center border border-accent/40 bg-accent/10 shadow-[0_0_18px_hsl(0_100%_65%/0.25)]">
      <span className="block h-0 w-0 border-y-[5px] border-l-[7px] border-y-transparent border-l-accent" style={{ marginLeft: "1.5px" }} aria-hidden />
    </span>
  );
}
