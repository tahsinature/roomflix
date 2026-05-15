import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowRight, Loader2, Users2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CodeInput } from "@/components/CodeInput";
import { useAuth } from "@/auth/AuthContext";
import { api } from "@/lib/api";

// Two ways to join:
//   • have a code → existing invite-redeem flow (CodeInput in alphanumeric mode)
//   • need a code → pairing flow: pick a name, get a numeric code, read
//                   it to the admin, page polls for approval, cookie
//                   lands automatically.
//
// /join/<code> deep-links straight into the invite path with the code
// pre-filled.
type Mode = "chooser" | "invite-code" | "invite-name" | "pairing-name" | "pairing-wait";

export default function Join() {
  const { code: codeFromUrl } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { redeemGuest, refresh } = useAuth();

  // Start on the chooser unless a code was deep-linked into the URL.
  const [mode, setMode] = useState<Mode>(codeFromUrl ? "invite-code" : "chooser");

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
        {mode === "chooser" && <Chooser onPick={setMode} />}
        {(mode === "invite-code" || mode === "invite-name") && (
          <InviteFlow
            initialCode={codeFromUrl ?? null}
            mode={mode}
            onBack={() => setMode("chooser")}
            onSwitchToName={() => setMode("invite-name")}
            onSubmitted={(code, displayName) =>
              redeemGuest({ code, displayName }).then(() => navigate("/library", { replace: true }))
            }
          />
        )}
        {(mode === "pairing-name" || mode === "pairing-wait") && (
          <PairingFlow
            mode={mode}
            onBack={() => setMode("chooser")}
            onStarted={() => setMode("pairing-wait")}
            onApproved={async () => {
              // Server set our session cookie on the status response — pull
              // fresh identity into AuthContext, then route to the library.
              await refresh();
              navigate("/library", { replace: true });
            }}
          />
        )}
      </div>
    </main>
  );
}

function Chooser({ onPick }: { onPick: (mode: Mode) => void }) {
  return (
    <>
      <h1 className="text-balance text-center text-[28px] font-bold leading-[1.1] tracking-tightest sm:text-[32px]">
        Join a space.
      </h1>
      <p className="mt-3 text-center text-[14px] leading-[1.6] text-muted-foreground">
        No account needed — just pick how you're joining.
      </p>

      <div className="mt-8 grid gap-3">
        <button
          type="button"
          onClick={() => onPick("invite-code")}
          className="flex flex-col items-start gap-1 border border-border bg-bg-elevated/40 px-4 py-3 text-left transition hover:border-border-hover hover:bg-bg-elevated/70"
        >
          <span className="text-[15px] font-medium text-foreground">I have a code</span>
          <span className="font-mono text-[11px] text-text-dim">8-character invite the host sent you</span>
        </button>
        <button
          type="button"
          onClick={() => onPick("pairing-name")}
          className="flex flex-col items-start gap-1 border border-accent/40 bg-accent/10 px-4 py-3 text-left transition hover:border-accent/60 hover:bg-accent/15"
        >
          <span className="text-[15px] font-medium text-foreground">Get a pairing code</span>
          <span className="font-mono text-[11px] text-text-dim">Read 8 digits to the host on a call — they'll admit you</span>
        </button>
      </div>

      <p className="mt-6 text-center text-[12px] text-text-dim">
        Have an account?{" "}
        <Link to="/login" className="text-foreground underline decoration-accent/40 underline-offset-4 transition hover:decoration-accent">
          Sign in
        </Link>
      </p>
    </>
  );
}

function InviteFlow({
  initialCode,
  mode,
  onBack,
  onSwitchToName,
  onSubmitted,
}: {
  initialCode: string | null;
  mode: "invite-code" | "invite-name";
  onBack: () => void;
  onSwitchToName: () => void;
  onSubmitted: (code: string, displayName: string) => Promise<void>;
}) {
  const [code, setCode] = useState((initialCode ?? "").toLowerCase());
  const [spaceName, setSpaceName] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  // Pre-fetch when the URL deep-linked a code.
  useEffect(() => {
    if (!initialCode) return;
    void runLookup(initialCode.toLowerCase());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCode]);

  const runLookup = async (next: string) => {
    setError("");
    try {
      const result = await api.lookupInvite(next);
      if (result.kind !== "guest") {
        setError("This code is for full members — register or sign in to use it.");
        return;
      }
      setSpaceName(result.spaceName);
      onSwitchToName();
    } catch (err) {
      setError((err as Error).message || "Couldn't find that code");
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (pending) return;
    const name = displayName.trim();
    if (!name) {
      setError("Pick a display name");
      return;
    }
    setError("");
    setPending(true);
    try {
      await onSubmitted(code, name);
    } catch (err) {
      setError((err as Error).message || "Couldn't join");
      setPending(false);
    }
  };

  if (mode === "invite-code") {
    return (
      <>
        <h1 className="text-balance text-center text-[28px] font-bold leading-[1.1] tracking-tightest sm:text-[32px]">
          Enter your code.
        </h1>
        <p className="mt-3 text-center text-[14px] leading-[1.6] text-muted-foreground">
          The 8-character code your host shared.
        </p>

        <div className="mt-8">
          <CodeInput
            value={code}
            onChange={(v) => {
              setCode(v);
              setError("");
            }}
            onComplete={(v) => void runLookup(v)}
            autoFocus
          />
        </div>

        {error && <div className="mt-4 border border-accent/40 bg-accent/10 px-3 py-2 text-center font-mono text-[12px] text-foreground">{error}</div>}

        <button type="button" onClick={onBack} className="mt-6 block w-full text-center text-[12px] text-text-dim transition hover:text-foreground">
          ← Back
        </button>
      </>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="text-center">
        <div className="inline-flex items-center gap-2 border border-border bg-bg-elevated/40 px-3 py-1.5 font-mono text-[11px] text-muted-foreground">
          <Users2 className="h-3 w-3" />
          Joining <span className="text-foreground">{spaceName ?? "this space"}</span>
        </div>
        <h1 className="mt-5 text-balance text-[28px] font-bold leading-[1.1] tracking-tightest sm:text-[32px]">Pick a name.</h1>
      </div>

      <label className="mt-8 block">
        <span className="section-label muted mb-1.5 block">Display name</span>
        <Input autoFocus value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="e.g. Sam" maxLength={50} required />
      </label>

      {error && <div className="mt-4 border border-accent/40 bg-accent/10 px-3 py-2 font-mono text-[12px] text-foreground">{error}</div>}

      <Button type="submit" variant="accent" size="lg" className="mt-6 w-full text-base" disabled={pending || !displayName.trim()}>
        {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
        Join space
      </Button>

      <button type="button" onClick={onBack} className="mt-4 block w-full text-center text-[12px] text-text-dim transition hover:text-foreground">
        ← Back
      </button>
    </form>
  );
}

function PairingFlow({
  mode,
  onBack,
  onStarted,
  onApproved,
}: {
  mode: "pairing-name" | "pairing-wait";
  onBack: () => void;
  onStarted: () => void;
  onApproved: () => Promise<void>;
}) {
  const [displayName, setDisplayName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [code, setCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);

  const start = async (e: FormEvent) => {
    e.preventDefault();
    const name = displayName.trim();
    if (!name) {
      setError("Pick a display name");
      return;
    }
    setError("");
    setPending(true);
    try {
      const result = await api.pairingStart(name);
      setCode(result.code);
      setExpiresAt(result.expiresAt);
      onStarted();
    } catch (err) {
      setError((err as Error).message || "Couldn't start pairing");
      setPending(false);
    }
  };

  if (mode === "pairing-name") {
    return (
      <form onSubmit={start}>
        <h1 className="text-balance text-center text-[28px] font-bold leading-[1.1] tracking-tightest sm:text-[32px]">Pick a name.</h1>
        <p className="mt-3 text-center text-[14px] leading-[1.6] text-muted-foreground">
          Other people in the space will see this when you're online.
        </p>

        <label className="mt-8 block">
          <span className="section-label muted mb-1.5 block">Display name</span>
          <Input autoFocus value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="e.g. Sam" maxLength={50} required />
        </label>

        {error && <div className="mt-4 border border-accent/40 bg-accent/10 px-3 py-2 font-mono text-[12px] text-foreground">{error}</div>}

        <Button type="submit" variant="accent" size="lg" className="mt-6 w-full text-base" disabled={pending || !displayName.trim()}>
          {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
          Get a code
        </Button>

        <button type="button" onClick={onBack} className="mt-4 block w-full text-center text-[12px] text-text-dim transition hover:text-foreground">
          ← Back
        </button>
      </form>
    );
  }

  // pairing-wait
  return (
    <PairingWait
      code={code ?? ""}
      expiresAt={expiresAt}
      onApproved={onApproved}
      onCancel={onBack}
    />
  );
}

function PairingWait({
  code,
  expiresAt,
  onApproved,
  onCancel,
}: {
  code: string;
  expiresAt: number | null;
  onApproved: () => Promise<void>;
  onCancel: () => void;
}) {
  const [status, setStatus] = useState<"pending" | "approved" | "expired">("pending");
  const [remaining, setRemaining] = useState<number | null>(null);
  const settledRef = useRef(false);

  // Poll every 1.5s. Stop on terminal status, on unmount, or when the
  // server tells us the code is gone.
  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = async () => {
      try {
        const result = await api.pairingStatus(code);
        if (cancelled) return;
        if (result.status === "approved") {
          settledRef.current = true;
          setStatus("approved");
          await onApproved();
          return;
        }
        if (result.status === "expired") {
          settledRef.current = true;
          setStatus("expired");
          return;
        }
      } catch {
        // Transient — try again next tick.
      }
      if (cancelled) return;
      timer = setTimeout(tick, 1500);
    };
    timer = setTimeout(tick, 1000);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [code, onApproved]);

  // Live countdown so the guest knows how long they have to share the code.
  useEffect(() => {
    if (!expiresAt) return;
    const update = () => setRemaining(Math.max(0, expiresAt - Date.now()));
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  const formatted = code ? `${code.slice(0, 4)} ${code.slice(4)}` : "····  ····";

  if (status === "approved") {
    return (
      <div className="text-center">
        <Loader2 className="mx-auto h-7 w-7 animate-spin text-accent/90" />
        <p className="mt-4 font-mono text-[12px] uppercase tracking-[0.22em] text-muted-foreground">Signing you in…</p>
      </div>
    );
  }

  if (status === "expired") {
    return (
      <div className="text-center">
        <h1 className="text-balance text-[24px] font-bold leading-[1.1] tracking-tightest text-foreground">Code expired.</h1>
        <p className="mt-3 text-[14px] text-muted-foreground">Codes are good for 10 minutes. Generate a new one to try again.</p>
        <Button type="button" variant="accent" size="lg" onClick={onCancel} className="mt-6 w-full text-base">
          Try again
        </Button>
      </div>
    );
  }

  return (
    <>
      <h1 className="text-balance text-center text-[28px] font-bold leading-[1.1] tracking-tightest sm:text-[32px]">Read this to your host.</h1>
      <p className="mt-3 text-center text-[14px] leading-[1.6] text-muted-foreground">
        They'll type it on their end. You'll be signed in automatically.
      </p>

      <div className="mt-8 border border-accent/40 bg-accent/10 px-6 py-8 text-center">
        <code className="block font-mono text-[44px] font-bold tracking-[0.16em] text-foreground tabular-nums sm:text-[56px]">
          {formatted}
        </code>
      </div>

      <div className="mt-4 flex items-center justify-center gap-2 font-mono text-[11px] text-text-dim">
        <Loader2 className="h-3 w-3 animate-spin" />
        Waiting for your host to admit you…
        {remaining !== null && remaining > 0 && <span className="text-text-dim">· expires in {Math.ceil(remaining / 1000)}s</span>}
      </div>

      <button type="button" onClick={onCancel} className="mt-6 block w-full text-center text-[12px] text-text-dim transition hover:text-foreground">
        ← Cancel
      </button>
    </>
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
