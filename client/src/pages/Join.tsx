import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowRight, Loader2, LogIn, Users2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CodeInput } from "@/components/CodeInput";
import { useAuth } from "@/auth/AuthContext";
import { api } from "@/lib/api";

// /join is the entry point for joining a space via an invite link or
// typed code. /join/<code> deep-links straight into the picker; bare
// /join opens the code-entry pad first.
//
// Three commitment levels are surfaced at the picker step:
//   - Watch as a guest  (no account)
//   - Sign in           (existing account → joins as member)
//   - Create an account (new account → joins as member)
//
// For approval-mode spaces the redemption returns { pending, requestId }
// and the page routes to /join/waiting/:id where status is polled.
type Mode = "invite-code" | "invite-picker" | "invite-guest-name";

export default function Join() {
  const { code: codeFromUrl } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { user, guest, redeemGuest, refresh } = useAuth();

  const initialCode = (codeFromUrl ?? "").toLowerCase().replace(/-/g, "");
  const [mode, setMode] = useState<Mode>("invite-code");
  const [code, setCode] = useState(initialCode);
  const [spaceName, setSpaceName] = useState<string | null>(null);

  // Auto-redeem path: a signed-in user landed here with a code (e.g.
  // they came back from /login after the universal picker bounced them
  // there). Skip the picker — they've already chosen "member".
  useEffect(() => {
    if (!user || !code) return;
    let cancelled = false;
    (async () => {
      try {
        const result = await api.redeemInvite(code);
        if (cancelled) return;
        if (result.pending) {
          navigate(`/join/waiting/${result.requestId}`, { replace: true });
          return;
        }
        await refresh();
        navigate("/library", { replace: true });
      } catch {
        // fall through: stay on the page, picker can offer guest path
        // (server told us the code is bad / expired). The picker's own
        // lookup will surface the same error if it persists.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, code, navigate, refresh]);

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
        {mode === "invite-code" && (
          <InviteCodeEntry
            initialCode={initialCode}
            onValidated={(c, name) => {
              setCode(c);
              setSpaceName(name);
              setMode("invite-picker");
            }}
          />
        )}

        {mode === "invite-picker" && (
          <InvitePicker
            spaceName={spaceName}
            code={code}
            isAuthed={!!user || !!guest}
            onPickGuest={() => setMode("invite-guest-name")}
            onPickSignIn={() => {
              navigate("/login", { state: { from: { pathname: `/join/${code}` } } });
            }}
            onPickRegister={() => {
              navigate("/register", { state: { from: { pathname: `/join/${code}` } } });
            }}
            onBack={() => setMode("invite-code")}
          />
        )}

        {mode === "invite-guest-name" && (
          <GuestNameForm
            spaceName={spaceName}
            onSubmit={async (displayName) => {
              const result = await redeemGuest({ code, displayName });
              if (result.pending) {
                navigate(`/join/waiting/${result.requestId}`, { replace: true });
              } else {
                navigate("/library", { replace: true });
              }
            }}
            onBack={() => setMode("invite-picker")}
          />
        )}
      </div>
    </main>
  );
}

// Code-entry pad. Validates with /api/invites/lookup before handing
// the (code, spaceName) off to the parent — that way the next screen
// can show "Joining <space>" without an extra round-trip.
function InviteCodeEntry({
  initialCode,
  onValidated,
}: {
  initialCode: string;
  onValidated: (code: string, spaceName: string) => void;
}) {
  const [code, setCode] = useState(initialCode);
  const [error, setError] = useState("");
  const ranInitial = useRef(false);

  const runLookup = async (next: string) => {
    setError("");
    try {
      const result = await api.lookupInvite(next);
      onValidated(next, result.spaceName);
    } catch (err) {
      setError((err as Error).message || "Couldn't find that code");
    }
  };

  // Auto-lookup when a code was deep-linked into the URL. Guard with
  // a ref so React StrictMode's double-mount doesn't fire it twice.
  useEffect(() => {
    if (ranInitial.current || !initialCode) return;
    ranInitial.current = true;
    void runLookup(initialCode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCode]);

  return (
    <>
      <h1 className="text-balance text-center text-[28px] font-bold leading-[1.1] tracking-tightest sm:text-[32px]">
        Enter your invite code.
      </h1>
      <p className="mt-3 text-center text-[14px] leading-[1.6] text-muted-foreground">
        The 8-character code your host shared (hyphen is optional).
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

      <p className="mt-6 text-center text-[12px] text-text-dim">
        Have an account?{" "}
        <Link to="/login" className="text-foreground underline decoration-accent/40 underline-offset-4 transition hover:decoration-accent">
          Sign in
        </Link>
      </p>
    </>
  );
}

// Universal picker — code is valid; the recipient now chooses how to
// enter. Guest is the no-account path; sign in / create account both
// land them back here (via state.from) and the auto-redeem effect on
// the parent finishes the join as a member.
function InvitePicker({
  spaceName,
  code,
  isAuthed,
  onPickGuest,
  onPickSignIn,
  onPickRegister,
  onBack,
}: {
  spaceName: string | null;
  code: string;
  isAuthed: boolean;
  onPickGuest: () => void;
  onPickSignIn: () => void;
  onPickRegister: () => void;
  onBack: () => void;
}) {
  // If we're already authed, the parent effect is racing to redeem —
  // show a holding state so the user doesn't see the picker briefly
  // before being redirected.
  if (isAuthed) {
    return (
      <div className="text-center">
        <Loader2 className="mx-auto h-7 w-7 animate-spin text-accent/90" />
        <p className="mt-4 font-mono text-[12px] uppercase tracking-[0.22em] text-muted-foreground">Joining…</p>
      </div>
    );
  }

  const display = code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;

  return (
    <>
      <div className="text-center">
        <div className="inline-flex items-center gap-2 border border-border bg-bg-elevated/40 px-3 py-1.5 font-mono text-[11px] text-muted-foreground">
          <Users2 className="h-3 w-3" />
          Joining <span className="text-foreground">{spaceName ?? "this space"}</span>
        </div>
        <h1 className="mt-5 text-balance text-[28px] font-bold leading-[1.1] tracking-tightest sm:text-[32px]">
          How do you want to join?
        </h1>
        <p className="mt-3 font-mono text-[11px] text-text-dim">code · {display}</p>
      </div>

      <div className="mt-8 grid gap-3">
        <PickerOption
          icon={<Users2 className="h-4 w-4 text-accent" />}
          title="Watch as a guest"
          desc="No account. Pick a display name and you're in."
          onClick={onPickGuest}
        />
        <PickerOption
          icon={<LogIn className="h-4 w-4 text-accent" />}
          title="Sign in"
          desc="Use an existing Roomflix account."
          onClick={onPickSignIn}
        />
        <PickerOption
          icon={<UserPlus className="h-4 w-4 text-accent" />}
          title="Create an account"
          desc="Save a library, rejoin later from anywhere."
          onClick={onPickRegister}
        />
      </div>

      <button type="button" onClick={onBack} className="mt-6 block w-full text-center text-[12px] text-text-dim transition hover:text-foreground">
        ← Back
      </button>
    </>
  );
}

function PickerOption({ icon, title, desc, onClick }: { icon: React.ReactNode; title: string; desc: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-start gap-3 border border-border bg-bg-elevated/40 px-4 py-3 text-left transition hover:border-border-hover hover:bg-bg-elevated/70"
    >
      <span className="mt-0.5">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium text-foreground">{title}</span>
        <span className="block font-mono text-[11px] text-text-dim">{desc}</span>
      </span>
      <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-text-dim" />
    </button>
  );
}

function GuestNameForm({
  spaceName,
  onSubmit,
  onBack,
}: {
  spaceName: string | null;
  onSubmit: (displayName: string) => Promise<void>;
  onBack: () => void;
}) {
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const submit = async (e: FormEvent) => {
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
      await onSubmit(name);
    } catch (err) {
      setError((err as Error).message || "Couldn't join");
      setPending(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <div className="text-center">
        <div className="inline-flex items-center gap-2 border border-border bg-bg-elevated/40 px-3 py-1.5 font-mono text-[11px] text-muted-foreground">
          <Users2 className="h-3 w-3" />
          Joining <span className="text-foreground">{spaceName ?? "this space"}</span>
        </div>
        <h1 className="mt-5 text-balance text-[28px] font-bold leading-[1.1] tracking-tightest sm:text-[32px]">Pick a name.</h1>
        <p className="mt-3 text-[14px] leading-[1.6] text-muted-foreground">
          Other people in the space will see this when you're online.
        </p>
      </div>

      <label className="mt-8 block">
        <span className="section-label muted mb-1.5 block">Display name</span>
        <Input autoFocus value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="e.g. Sam" maxLength={50} required />
      </label>

      {error && <div className="mt-4 border border-accent/40 bg-accent/10 px-3 py-2 font-mono text-[12px] text-foreground">{error}</div>}

      <Button type="submit" variant="accent" size="lg" className="mt-6 w-full text-base" disabled={pending || !displayName.trim()}>
        {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
        Join as guest
      </Button>

      <button type="button" onClick={onBack} className="mt-4 block w-full text-center text-[12px] text-text-dim transition hover:text-foreground">
        ← Back
      </button>
    </form>
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
