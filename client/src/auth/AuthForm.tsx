import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Mode = "login" | "register";

// Shared form chrome for /login and /register. Each page passes its own
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
    <main className="relative flex min-h-screen flex-col items-center justify-center px-6 py-12">
      <BackgroundOrbs />
      <Link to="/" className="absolute left-6 top-6 flex items-center gap-2.5 text-foreground transition hover:opacity-80">
        <BrandMark />
        <span className="text-[15px] font-bold tracking-tight">
          Roomflix<span className="text-accent">.</span>
        </span>
      </Link>

      <div className="w-full max-w-sm">
        <h1 className="text-balance text-[32px] font-bold leading-[1.1] tracking-tightest sm:text-[36px]">{title}</h1>
        <p className="mt-3 text-[15px] leading-[1.6] text-muted-foreground">{subtitle}</p>

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
            <span className="section-label muted mb-1.5 block">Password</span>
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
      </div>
    </main>
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
