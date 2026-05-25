import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Loader2 } from "lucide-react";
import { AuthChrome } from "@/auth/AuthChrome";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Mode = "login" | "register";

// Shared form for /login and /register. Each page passes its own
// onSubmit + copy — the form itself doesn't know which mode it's in beyond
// what's needed for labels and the link at the bottom.
export function AuthForm({
  mode,
  onSubmit,
  title,
  subtitle,
  submitLabel,
  switchLink,
}: {
  mode: Mode;
  onSubmit: (input: { username: string; password: string }) => Promise<void>;
  title: string;
  subtitle: string;
  submitLabel: string;
  switchLink: { prompt: string; cta: string; to: string };
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (pending) return;
    setError("");
    setPending(true);
    try {
      await onSubmit({ username: username.trim(), password });
    } catch (err) {
      setError((err as Error).message || "Something went wrong");
      setPending(false);
    }
  };

  return (
    <AuthChrome title={title} subtitle={subtitle}>
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
        <label className="block">
          <span className="section-label muted mb-1.5 flex items-baseline justify-between">
            <span>Password</span>
            {mode === "login" && (
              <Link
                to="/reset-password"
                className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground transition hover:text-foreground"
              >
                Forgot?
              </Link>
            )}
          </span>
          <Input
            allowAutofill
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={mode === "register" ? "at least 8 characters" : "••••••••"}
            required
            minLength={mode === "register" ? 8 : undefined}
          />
        </label>

        {error && <div className="border border-accent/40 bg-accent/10 px-3 py-2 font-mono text-[12px] text-foreground">{error}</div>}

        <Button type="submit" variant="accent" size="lg" className="w-full text-base" disabled={pending}>
          {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
          {submitLabel}
        </Button>
      </form>

      <p className="mt-6 text-center text-[13px] text-muted-foreground">
        {switchLink.prompt}{" "}
        <Link to={switchLink.to} className="text-foreground underline decoration-accent/40 underline-offset-4 transition hover:decoration-accent">
          {switchLink.cta}
        </Link>
      </p>

      {/* Invite-code path. Lives below the register/login switch link
          so the primary flow stays uninterrupted, but is reachable
          without going back to the marketing page. */}
      <p className="mt-2 text-center text-[13px] text-muted-foreground">
        Have an invite code?{" "}
        <Link to="/join" className="text-foreground underline decoration-accent/40 underline-offset-4 transition hover:decoration-accent">
          Sign in with code
        </Link>
      </p>
    </AuthChrome>
  );
}
