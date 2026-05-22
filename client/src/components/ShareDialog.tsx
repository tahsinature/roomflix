import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Check, Copy, Link2, Loader2 } from "lucide-react";
import type { ShareLink } from "@shared/protocol";
import { api } from "@/lib/api";
import { Modal } from "@/components/Modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// What a share dialog is pointed at — a single media URL or a collection.
export type ShareTarget = { kind: "url"; url: string; title: string } | { kind: "collection"; collectionId: string; title: string };

const DAY_MS = 86_400_000;
const EXPIRY_OPTIONS = [
  { label: "Never", days: 0 },
  { label: "1 day", days: 1 },
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
];

// Creates a public share link for a media URL or collection. Two phases:
// a config form, then the generated link with a copy button + QR code.
export function ShareDialog({ target, onClose, onCreated }: { target: ShareTarget; onClose: () => void; onCreated?: (link: ShareLink) => void }) {
  const [label, setLabel] = useState(target.title);
  const [passcode, setPasscode] = useState("");
  const [expiryDays, setExpiryDays] = useState(0);
  const [maxAccesses, setMaxAccesses] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<ShareLink | null>(null);
  const [copied, setCopied] = useState(false);

  const shareUrl = created ? `${window.location.origin}/share/${created.id}` : "";

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const capRaw = Number(maxAccesses);
      const cap = maxAccesses.trim() && Number.isFinite(capRaw) && capRaw >= 1 ? Math.floor(capRaw) : null;
      const link = await api.createShare({
        label: label.trim(),
        targetKind: target.kind,
        targetUrl: target.kind === "url" ? target.url : undefined,
        targetTitle: target.kind === "url" ? target.title : undefined,
        targetCollectionId: target.kind === "collection" ? target.collectionId : undefined,
        passcode: passcode.trim() || undefined,
        expiresAt: expiryDays > 0 ? Date.now() + expiryDays * DAY_MS : null,
        maxAccesses: cap,
      });
      setCreated(link);
      onCreated?.(link);
    } catch (e) {
      setError((e as Error).message || "Couldn't create the link.");
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — the field is selectable as a fallback */
    }
  };

  return (
    <Modal open title={created ? "Share link ready" : "Create a share link"} onClose={onClose} className="max-w-md">
      {created ? (
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Anyone with this link can view “{created.label || target.title}”{created.hasPasscode ? " after entering the passcode" : ""}.
          </p>
          <div className="flex items-center gap-2">
            <Input readOnly value={shareUrl} onFocus={(e) => e.currentTarget.select()} className="flex-1 font-mono text-xs" />
            <Button variant="outline" size="icon" onClick={copy} aria-label="Copy link" title="Copy link">
              {copied ? <Check className="h-4 w-4 text-live" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <div className="flex justify-center">
            <div className="bg-white p-3">
              <QRCodeSVG value={shareUrl} size={156} />
            </div>
          </div>
          <p className="text-center font-mono text-[10px] text-text-dim">Manage every link from the Share Control page.</p>
          <div className="flex justify-end">
            <Button variant="outline" onClick={onClose}>
              Done
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3.5">
          <Field label="Label">
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="A name for this link" />
          </Field>
          <Field label="Passcode (optional)">
            <Input value={passcode} onChange={(e) => setPasscode(e.target.value)} placeholder="Leave blank for no passcode" />
          </Field>
          <Field label="Expires">
            <div className="flex gap-1.5">
              {EXPIRY_OPTIONS.map((o) => (
                <button
                  key={o.days}
                  type="button"
                  onClick={() => setExpiryDays(o.days)}
                  className={cn(
                    "flex-1 border px-2 py-1.5 text-xs transition",
                    expiryDays === o.days ? "border-accent bg-accent/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Max opens (optional)">
            <Input type="number" min={1} value={maxAccesses} onChange={(e) => setMaxAccesses(e.target.value)} placeholder="Unlimited" />
          </Field>
          {error && <div className="border border-accent/40 bg-accent/10 px-3 py-2 text-xs text-foreground">{error}</div>}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="accent" onClick={submit} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
              Create link
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.16em] text-text-dim">{label}</span>
      {children}
    </div>
  );
}
