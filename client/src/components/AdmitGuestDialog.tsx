import { useEffect, useState, type FormEvent } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Modal } from "@/components/Modal";
import { Button } from "@/components/ui/button";
import { CodeInput } from "@/components/CodeInput";
import { useAuth } from "@/auth/AuthContext";
import { api } from "@/lib/api";

// Admit-guest dialog. Admin types the 8-digit pairing code their friend
// is reading off another device; we POST it to /api/pairing/approve and
// the guest's polling tab gets signed in.
export function AdmitGuestDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { currentSpace } = useAuth();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [admitted, setAdmitted] = useState<{ displayName: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    setCode("");
    setError("");
    setPending(false);
    setAdmitted(null);
  }, [open]);

  const submit = async (next?: string) => {
    const value = (next ?? code).trim();
    if (value.length !== 8) {
      setError("Code must be 8 digits");
      return;
    }
    setError("");
    setPending(true);
    try {
      const result = await api.pairingApprove(value);
      setAdmitted({ displayName: result.displayName });
    } catch (err) {
      setError((err as Error).message || "Couldn't admit");
      setPending(false);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    void submit();
  };

  return (
    <Modal open={open} title="Admit a guest" onClose={pending ? () => {} : onClose} className="max-w-md">
      {admitted ? (
        <div className="space-y-4 text-center">
          <CheckCircle2 className="mx-auto h-9 w-9 text-emerald-400" />
          <div>
            <h3 className="text-base font-medium text-foreground">
              {admitted.displayName} is in.
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              They're now signed in to <span className="text-foreground">{currentSpace?.name}</span> as a guest.
            </p>
          </div>
          <Button variant="accent" size="lg" onClick={onClose} className="w-full">
            Done
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <h3 className="text-base font-medium text-foreground">Enter their 8-digit code</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              They'll see it on their device after picking "Get a pairing code" on /join. Joining as a guest in{" "}
              <span className="text-foreground">{currentSpace?.name ?? "this space"}</span>.
            </p>
          </div>

          <CodeInput
            value={code}
            onChange={(v) => {
              setCode(v);
              setError("");
            }}
            onComplete={(v) => void submit(v)}
            digitsOnly
            autoFocus
            disabled={pending}
          />

          {error && (
            <div className="border border-accent/40 bg-accent/10 px-3 py-2 text-center font-mono text-[12px] text-foreground">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" variant="accent" disabled={pending || code.length !== 8}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Admit
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
