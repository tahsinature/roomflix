import { useEffect, useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { Modal } from "@/components/Modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/auth/AuthContext";

// Small profile editor. Works for both real users and guests — guests
// don't have a username row (they have no account), and their display
// name is required (can't be blanked out).
export function ProfileDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, guest, isGuest, updateProfile } = useAuth();
  const initial = isGuest ? guest?.displayName ?? "" : user?.displayName ?? "";
  const [displayName, setDisplayName] = useState(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setDisplayName(initial);
    setError("");
    setPending(false);
  }, [open, initial]);

  if (!user && !guest) return null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (pending) return;
    setError("");
    const trimmed = displayName.trim();
    if (isGuest && !trimmed) {
      setError("Display name is required");
      return;
    }
    setPending(true);
    try {
      await updateProfile({ displayName: trimmed === "" ? null : trimmed });
      onClose();
    } catch (err) {
      setError((err as Error).message || "Couldn't save");
      setPending(false);
    }
  };

  return (
    <Modal open={open} title="Edit profile" onClose={pending ? () => {} : onClose} className="max-w-md">
      <form onSubmit={submit} className="space-y-4">
        {!isGuest && user && (
          <div>
            <span className="section-label muted mb-1.5 block">Username</span>
            <div className="border border-border bg-bg-elevated/40 px-3 py-2 font-mono text-sm text-foreground/85">
              @{user.username}
            </div>
            <p className="mt-1.5 text-[11px] text-text-dim">Your unique handle. Can't be changed.</p>
          </div>
        )}

        {isGuest && (
          <div className="border border-border bg-bg-elevated/40 px-3 py-2 font-mono text-[11px] text-text-dim">
            You're joined as a guest. Your name shows up as <span className="text-foreground">"{displayName.trim() || guest?.displayName || "…"} (guest)"</span> for other space members.
          </div>
        )}

        <label className="block">
          <span className="section-label muted mb-1.5 block">Display name</span>
          <Input
            autoFocus
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={isGuest ? "Required for guests" : "Leave blank to use @username"}
            maxLength={50}
            required={isGuest}
          />
          <p className="mt-1.5 text-[11px] text-text-dim">
            {isGuest ? "Up to 50 characters." : "Shown to other space members. Up to 50 characters."}
          </p>
        </label>

        {error && <div className="border border-accent/40 bg-accent/10 px-3 py-2 font-mono text-[12px] text-foreground">{error}</div>}

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" variant="accent" disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save
          </Button>
        </div>
      </form>
    </Modal>
  );
}
