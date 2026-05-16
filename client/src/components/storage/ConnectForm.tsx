import { useState } from "react";
import { Eye, EyeOff, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfigFileDialog } from "@/components/ConfigFileDialog";
import { parseConfigFile, parseConfigText } from "@/lib/buckets/config_file";
import type { Connection } from "@/lib/buckets/types";

type DraftFields = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicBaseUrl: string;
  maxGb: string;
  label: string;
};

const EMPTY: DraftFields = {
  accountId: "",
  accessKeyId: "",
  secretAccessKey: "",
  bucket: "",
  publicBaseUrl: "",
  maxGb: "",
  label: "",
};

const GB = 1024 ** 3;

export function ConnectForm({
  initial,
  busy,
  error,
  submitLabel = "Connect",
  busyLabel = "Connecting…",
  onConnect,
  onImportError,
  onCancel,
}: {
  initial?: Connection;
  busy: boolean;
  error: string;
  submitLabel?: string;
  busyLabel?: string;
  onConnect: (conn: Connection) => void;
  onImportError: (message: string) => void;
  // Optional secondary action — rendered as a "Cancel" link next to
  // the submit button when supplied. Lets a host modal close the form
  // without a separate footer.
  onCancel?: () => void;
}) {
  const [fields, setFields] = useState<DraftFields>(() => toDraft(initial) ?? EMPTY);
  const [showSecret, setShowSecret] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  // Edit mode = there was an existing connection to seed from. Used
  // to drive secret-field placeholder text and other edit-only hints.
  const isEdit = initial !== undefined;

  const set = <K extends keyof DraftFields>(k: K, v: string) => setFields((f) => ({ ...f, [k]: v }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const built = buildConnection(fields);
    if (built.ok) onConnect(built.connection);
    else onImportError(built.reason);
  };

  const handleImport = async (input: File | string) => {
    const parsed = typeof input === "string" ? parseConfigText(input) : await parseConfigFile(input);
    if (!parsed.ok) {
      onImportError(parsed.reason);
      return;
    }
    setFields(toDraftFromConnection(parsed.connection));
    setImportOpen(false);
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      {/* Import-from-JSON shortcut. Host page picks the provider, so we
          don't reiterate that here — keep the form focused on fields. */}
      <div className="flex items-center justify-end">
        <Button type="button" variant="outline" size="sm" onClick={() => setImportOpen(true)}>
          <Upload className="h-3.5 w-3.5" />
          Import from JSON
        </Button>
      </div>

      <ConfigFileDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import storage config"
        description="Paste a previously-exported connection JSON, or pick the file. The credentials populate the form below — review them, then save."
        placeholder='{"kind":"roomflix-storage-connection","version":1,…}'
        onSubmit={handleImport}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Account ID" hint="From R2 dashboard → Overview">
          <Input value={fields.accountId} onChange={(e) => set("accountId", e.target.value)} placeholder="e.g. 8f3c9e…" autoCapitalize="off" autoCorrect="off" spellCheck={false} />
        </Field>
        <Field label="Bucket" hint="The bucket name, exactly as in R2">
          <Input value={fields.bucket} onChange={(e) => set("bucket", e.target.value)} placeholder="e.g. videos" autoCapitalize="off" autoCorrect="off" spellCheck={false} />
        </Field>
        <Field label="Access Key ID">
          <Input value={fields.accessKeyId} onChange={(e) => set("accessKeyId", e.target.value)} autoCapitalize="off" autoCorrect="off" spellCheck={false} autoComplete="off" />
        </Field>
        <Field label="Secret Access Key">
          <div className="relative">
            <Input
              type={showSecret ? "text" : "password"}
              value={fields.secretAccessKey}
              onChange={(e) => set("secretAccessKey", e.target.value)}
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              autoComplete="off"
              // In edit mode the saved secret never round-trips to the
              // client — the field starts empty by design. Spell it
              // out so users don't think their secret got lost.
              placeholder={isEdit ? "(saved — leave blank to keep, or type to rotate)" : undefined}
              className={fields.secretAccessKey ? "pr-10" : undefined}
            />
            {/* No toggle when there's no value to mask/reveal — without
                this, the eye is a misleading no-op in the saved-empty
                state on the edit modal. */}
            {fields.secretAccessKey && (
              <button
                type="button"
                onClick={() => setShowSecret((v) => !v)}
                aria-label={showSecret ? "Hide secret" : "Show secret"}
                // z-10 lifts the toggle above the native input —
                // without it, the input's own padding-area catches the
                // click and the toggle never fires.
                className="absolute inset-y-0 right-0 z-10 flex w-10 items-center justify-center text-muted-foreground transition hover:text-foreground"
              >
                {showSecret ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            )}
          </div>
        </Field>
        <Field label="Max bucket size (GB)" hint="Refuses uploads that would exceed this cap">
          <Input type="number" inputMode="decimal" min="0.1" step="0.1" value={fields.maxGb} onChange={(e) => set("maxGb", e.target.value)} placeholder="e.g. 10" />
        </Field>
        <Field label="Public base URL" hint="Optional — enables Library matching">
          <Input value={fields.publicBaseUrl} onChange={(e) => set("publicBaseUrl", e.target.value)} placeholder="https://pub-….r2.dev" autoCapitalize="off" autoCorrect="off" spellCheck={false} />
        </Field>
        <Field label="Label" hint="Optional — for your own reference">
          <Input value={fields.label} onChange={(e) => set("label", e.target.value)} placeholder="e.g. Roomflix videos" />
        </Field>
      </div>

      {error && <p className="text-xs text-accent">{error}</p>}

      <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
        {onCancel && (
          <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        )}
        <Button type="submit" variant="accent" disabled={busy}>
          {busy ? busyLabel : submitLabel}
        </Button>
      </div>
    </form>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</span>
      <div className="mt-1.5">{children}</div>
      {hint && <span className="mt-1 block text-[11px] text-text-dim">{hint}</span>}
    </label>
  );
}

function toDraft(conn: Connection | undefined): DraftFields | null {
  if (!conn) return null;
  return toDraftFromConnection(conn);
}

function toDraftFromConnection(conn: Connection): DraftFields {
  return {
    accountId: conn.accountId,
    accessKeyId: conn.accessKeyId,
    secretAccessKey: conn.secretAccessKey,
    bucket: conn.bucket,
    publicBaseUrl: conn.publicBaseUrl ?? "",
    maxGb: (conn.maxBytes / GB).toString(),
    label: conn.label ?? "",
  };
}

type Built = { ok: true; connection: Connection } | { ok: false; reason: string };

function buildConnection(f: DraftFields): Built {
  const accountId = f.accountId.trim();
  const accessKeyId = f.accessKeyId.trim();
  const secretAccessKey = f.secretAccessKey.trim();
  const bucket = f.bucket.trim();

  if (!accountId) return { ok: false, reason: "Account ID is required." };
  if (!accessKeyId) return { ok: false, reason: "Access Key ID is required." };
  if (!secretAccessKey) return { ok: false, reason: "Secret Access Key is required." };
  if (!bucket) return { ok: false, reason: "Bucket is required." };

  const maxGb = Number(f.maxGb);
  if (!Number.isFinite(maxGb) || maxGb <= 0) {
    return { ok: false, reason: "Max bucket size must be a positive number of GB." };
  }

  // Auto-prefix https:// on the public base URL so library URLs built from
  // `publicBase + key` end up well-formed even if the user pasted a bare host.
  const rawPublicBase = f.publicBaseUrl.trim();
  const publicBaseUrl = rawPublicBase ? (/^[a-z][a-z0-9+\-.]*:\/\//i.test(rawPublicBase) ? rawPublicBase : `https://${rawPublicBase}`) : undefined;

  return {
    ok: true,
    connection: {
      provider: "r2",
      accountId,
      accessKeyId,
      secretAccessKey,
      bucket,
      publicBaseUrl,
      maxBytes: Math.round(maxGb * GB),
      label: f.label.trim() || undefined,
    },
  };
}
