import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { AuthChrome } from "@/auth/AuthChrome";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// /reset-password — username-only "send me a link" form. The server
// always 204s (anti-enumeration) and there's no email yet, so this page
// shows a success state that tells the user to ask the operator for the
// link if one was generated. When email is wired up, the copy here is
// the only client change needed.
export default function PasswordResetRequest() {
  const [username, setUsername] = useState("");
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (pending) return;
    setError("");
    setPending(true);
    try {
      await api.requestPasswordReset({ username: username.trim() });
      setSent(true);
    } catch (err) {
      setError((err as Error).message || "Something went wrong");
    } finally {
      setPending(false);
    }
  };

  if (sent) {
    return (
      <AuthChrome title="Check with the operator." subtitle="If that username exists, a reset link was generated.">
        <div className="mt-8 border border-border/40 bg-card/30 px-4 py-3 text-[13px] leading-[1.6] text-muted-foreground">
          Email isn't wired up yet, so the link is in the server logs. Ask the operator to grab it for you, then open it to choose a new password.
        </div>
        <div className="mt-6 flex flex-col gap-2 text-center">
          <Link to="/login" className="text-[13px] text-foreground underline decoration-accent/40 underline-offset-4 transition hover:decoration-accent">
            Back to sign in
          </Link>
        </div>
      </AuthChrome>
    );
  }

  return (
    <AuthChrome title="Reset your password." subtitle="Enter your username — the server will generate a one-use link.">
      <form onSubmit={handleSubmit} className="mt-8 space-y-3">
        <label className="block">
          <span className="section-label muted mb-1.5 block">Username</span>
          <Input
            allowAutofill
            autoFocus
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="movie-buff"
            required
            minLength={3}
            maxLength={32}
          />
        </label>

        {error && <div className="border border-accent/40 bg-accent/10 px-3 py-2 font-mono text-[12px] text-foreground">{error}</div>}

        <Button type="submit" variant="accent" size="lg" className="w-full text-base" disabled={pending}>
          {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
          Request reset link
        </Button>
      </form>

      <p className="mt-6 text-center text-[13px] text-muted-foreground">
        Remembered it?{" "}
        <Link to="/login" className="text-foreground underline decoration-accent/40 underline-offset-4 transition hover:decoration-accent">
          Back to sign in
        </Link>
      </p>
    </AuthChrome>
  );
}
