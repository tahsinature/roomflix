import { useEffect, useState, type FormEvent } from "react";
import { CheckCircle2, Loader2, UserCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/auth/AuthContext";

// Profile settings — the inline twin of ProfileDialog. Lives at
// /settings/profile so the user has a non-modal place to view + edit
// their account details. Guests (when they ever land here) get a
// stripped variant; the route is currently real-users-only so this is
// defensive.
export default function SettingsProfile() {
  const { user, guest, isGuest, updateProfile } = useAuth();
  const initial = isGuest ? (guest?.displayName ?? "") : (user?.displayName ?? "");
  const [displayName, setDisplayName] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // Brief confirmation chip after a successful save. Auto-clears so
  // the page doesn't carry a stale "Saved ✓" forever.
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    setDisplayName(initial);
  }, [initial]);

  useEffect(() => {
    if (!savedAt) return;
    const t = setTimeout(() => setSavedAt(null), 2400);
    return () => clearTimeout(t);
  }, [savedAt]);

  if (!user && !guest) return null;

  const dirty = displayName.trim() !== (initial ?? "").trim();
  const canSave = !saving && dirty && (!isGuest || displayName.trim().length > 0);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    const trimmed = displayName.trim();
    if (isGuest && !trimmed) {
      setError("Display name is required");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await updateProfile({ displayName: trimmed === "" ? null : trimmed });
      setSavedAt(Date.now());
    } catch (err) {
      setError((err as Error).message || "Couldn't save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <section>
        <header className="mb-3">
          <span className="section-label muted">Identity</span>
          <p className="mt-1 font-mono text-[11px] text-text-dim">How you appear to other members of your spaces.</p>
        </header>

        <form onSubmit={submit} className="flex flex-col gap-4 border border-border bg-bg-elevated/40 p-5">
          {!isGuest && user && (
            <Field label="Username" hint="Your unique handle. Can't be changed.">
              <div className="flex items-center gap-3 border border-border bg-black/20 px-3 py-2">
                <UserCircle2 className="h-4 w-4 shrink-0 text-text-dim" />
                <span className="font-mono text-sm text-foreground/85">@{user.username}</span>
              </div>
            </Field>
          )}

          <Field
            label="Display name"
            hint={isGuest ? "Required for guests. Up to 50 characters." : "Shown to other space members. Leave blank to use @username. Up to 50 characters."}
          >
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={isGuest ? "Required for guests" : "Leave blank to use @username"}
              maxLength={50}
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              required={isGuest}
            />
          </Field>

          {error && <div className="border border-accent/40 bg-accent/10 px-3 py-2 font-mono text-[12px] text-foreground">{error}</div>}

          <div className="flex items-center justify-end gap-3 border-t border-border pt-3">
            {savedAt && (
              <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-emerald-300">
                <CheckCircle2 className="h-3 w-3" />
                Saved
              </span>
            )}
            <Button type="submit" variant="accent" disabled={!canSave}>
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Save changes
            </Button>
          </div>
        </form>
      </section>

      <section>
        <header className="mb-3">
          <span className="section-label muted">Account</span>
        </header>
        <div className="border border-border bg-bg-elevated/40 p-5 text-xs text-muted-foreground">
          More account controls coming here later — sign-out everywhere, sessions, password.
        </div>
      </section>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="section-label muted">{label}</span>
      <div className="mt-2">{children}</div>
      {hint && <p className="mt-1.5 font-mono text-[11px] text-text-dim">{hint}</p>}
    </label>
  );
}
