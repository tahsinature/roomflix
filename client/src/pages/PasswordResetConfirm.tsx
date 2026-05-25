import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowRight, Loader2 } from "lucide-react";
import { ApiError, api } from "@/lib/api";
import { AuthChrome } from "@/auth/AuthChrome";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// /reset-password/:token — landing page for the link the operator hands
// the user. Validates the token up front so an expired link doesn't
// take a password input only to fail on submit. On success: bounces to
// /login. The reset endpoint nukes any live sessions, so even if the
// user was logged in elsewhere they'll need to sign back in.
export default function PasswordResetConfirm() {
  const { token = "" } = useParams<{ token: string }>();
  const navigate = useNavigate();

  const [phase, setPhase] = useState<"validating" | "ready" | "expired" | "done">("validating");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  // Validate once on mount. We don't poll — the token can't transition
  // from invalid → valid, and re-checking after the user types adds
  // nothing.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.validatePasswordResetToken(token);
        if (cancelled) return;
        setUsername(res.username);
        setPhase("ready");
      } catch {
        if (cancelled) return;
        setPhase("expired");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (pending) return;
    setError("");
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    setPending(true);
    try {
      await api.confirmPasswordReset({ token, newPassword: password });
      setPhase("done");
      // Short pause so the success state is visible before the bounce.
      window.setTimeout(() => navigate("/login", { replace: true }), 1200);
    } catch (err) {
      // 410 means the token expired/was used between validate and now.
      if (err instanceof ApiError && err.status === 410) {
        setPhase("expired");
      } else {
        setError((err as Error).message || "Something went wrong");
      }
      setPending(false);
    }
  };

  if (phase === "validating") {
    return (
      <AuthChrome title="Checking your link…" subtitle="One moment while we verify the reset token.">
        <div className="mt-8 flex items-center justify-center py-6">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AuthChrome>
    );
  }

  if (phase === "expired") {
    return (
      <AuthChrome title="Link expired." subtitle="This reset link has been used or is no longer valid.">
        <div className="mt-8 flex flex-col gap-3">
          <Link to="/reset-password" className="w-full">
            <Button variant="accent" size="lg" className="w-full text-base">
              <ArrowRight className="h-4 w-4" />
              Request a new link
            </Button>
          </Link>
          <Link to="/login" className="text-center text-[13px] text-muted-foreground underline decoration-accent/40 underline-offset-4 transition hover:decoration-accent hover:text-foreground">
            Back to sign in
          </Link>
        </div>
      </AuthChrome>
    );
  }

  if (phase === "done") {
    return (
      <AuthChrome title="Password updated." subtitle="Redirecting you to sign in…">
        <div className="mt-8 flex items-center justify-center py-6">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AuthChrome>
    );
  }

  return (
    <AuthChrome title="Choose a new password." subtitle={`Resetting password for @${username}.`}>
      <form onSubmit={handleSubmit} className="mt-8 space-y-3">
        <label className="block">
          <span className="section-label muted mb-1.5 block">New password</span>
          <Input
            allowAutofill
            autoFocus
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="at least 8 characters"
            required
            minLength={8}
          />
        </label>
        <label className="block">
          <span className="section-label muted mb-1.5 block">Confirm new password</span>
          <Input
            allowAutofill
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="repeat it"
            required
            minLength={8}
          />
        </label>

        {error && <div className="border border-accent/40 bg-accent/10 px-3 py-2 font-mono text-[12px] text-foreground">{error}</div>}

        <Button type="submit" variant="accent" size="lg" className="w-full text-base" disabled={pending}>
          {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
          Update password
        </Button>
      </form>

      <p className="mt-6 text-center text-[13px] text-muted-foreground">
        Changed your mind?{" "}
        <Link to="/login" className="text-foreground underline decoration-accent/40 underline-offset-4 transition hover:decoration-accent">
          Back to sign in
        </Link>
      </p>
    </AuthChrome>
  );
}
