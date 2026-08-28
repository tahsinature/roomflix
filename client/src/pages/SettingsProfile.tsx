import { useEffect, useState, type FormEvent } from "react";
import { CheckCircle2, Loader2, MapPin, UserCircle2, Wand2 } from "lucide-react";
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
  const initialName = isGuest ? (guest?.displayName ?? "") : (user?.displayName ?? "");
  const initialTimezone = user?.timezone ?? "";
  const initialCity = user?.city ?? "";

  const [displayName, setDisplayName] = useState(initialName);
  const [timezone, setTimezone] = useState(initialTimezone);
  const [city, setCity] = useState(initialCity);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // Brief confirmation chip after a successful save. Auto-clears so
  // the page doesn't carry a stale "Saved ✓" forever.
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    setDisplayName(initialName);
  }, [initialName]);
  useEffect(() => {
    setTimezone(initialTimezone);
  }, [initialTimezone]);
  useEffect(() => {
    setCity(initialCity);
  }, [initialCity]);
  useEffect(() => {
    if (!savedAt) return;
    const t = setTimeout(() => setSavedAt(null), 2400);
    return () => clearTimeout(t);
  }, [savedAt]);

  if (!user && !guest) return null;

  const dirty = displayName.trim() !== (initialName ?? "").trim() || timezone.trim() !== (initialTimezone ?? "").trim() || city.trim() !== (initialCity ?? "").trim();
  const canSave = !saving && dirty && (!isGuest || displayName.trim().length > 0);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    const trimmedName = displayName.trim();
    const trimmedTz = timezone.trim();
    const trimmedCity = city.trim();
    if (isGuest && !trimmedName) {
      setError("Display name is required");
      return;
    }
    setSaving(true);
    setError("");
    try {
      // Build a patch with only changed fields so guests don't send
      // server-rejected location fields they have no business
      // setting. The server already ignores them on the guest path,
      // but this keeps the wire payload honest.
      const patch: Parameters<typeof updateProfile>[0] = {};
      if (trimmedName !== (initialName ?? "").trim()) patch.displayName = trimmedName === "" ? null : trimmedName;
      if (!isGuest) {
        if (trimmedTz !== (initialTimezone ?? "").trim()) patch.timezone = trimmedTz === "" ? null : trimmedTz;
        if (trimmedCity !== (initialCity ?? "").trim()) patch.city = trimmedCity === "" ? null : trimmedCity;
      }
      await updateProfile(patch);
      setSavedAt(Date.now());
    } catch (err) {
      setError((err as Error).message || "Couldn't save");
    } finally {
      setSaving(false);
    }
  };

  const detectTimezone = () => {
    try {
      const detected = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
      if (detected) setTimezone(detected);
    } catch {
      /* ignore — input stays as-is */
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      <section>
        <header className="mb-3">
          <span className="section-label muted">Identity</span>
          <p className="mt-1 font-mono text-[11px] text-text-dim">How you appear to other members of your spaces.</p>
        </header>

        <div className="flex flex-col gap-4 border border-border bg-bg-elevated/40 p-5">
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
        </div>
      </section>

      {!isGuest && (
        <section>
          <header className="mb-3">
            <span className="section-label muted">Location</span>
            <p className="mt-1 font-mono text-[11px] text-text-dim">Shows your local time and weather in the space members menu.</p>
          </header>
          <div className="flex flex-col gap-4 border border-border bg-bg-elevated/40 p-5">
            <Field label="Timezone" hint="IANA name (e.g. America/Los_Angeles). Auto-detected from your browser on login.">
              <div className="flex items-stretch gap-2">
                <Input
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  placeholder="Auto-detected on login"
                  maxLength={64}
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                />
                <Button type="button" variant="outline" onClick={detectTimezone} className="shrink-0" title="Use the browser's current timezone">
                  <Wand2 className="h-3.5 w-3.5" />
                  Detect
                </Button>
              </div>
            </Field>

            <Field label="City" hint="Used to pull weather for your row in the members menu. Free text, up to 80 characters.">
              <div className="relative">
                <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-dim" />
                <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g. Dhaka" maxLength={80} className="pl-9" autoCapitalize="words" spellCheck={false} />
              </div>
            </Field>
          </div>
        </section>
      )}

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
