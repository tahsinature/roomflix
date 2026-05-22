import { useEffect, useRef, useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/Modal";

// Shared import modal. Hosts a file picker AND a paste textarea so the user
// can drop in a JSON config either way. File wins if both are filled.
// Library uses this for its export payload, Storage uses it for the
// connection config — the dialog itself is content-agnostic.
export function ConfigFileDialog({
  open,
  onClose,
  title,
  description,
  placeholder,
  submitLabel,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  placeholder?: string;
  submitLabel?: string;
  onSubmit: (input: File | string) => Promise<void> | void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setFile(null);
      setText("");
      setBusy(false);
    }
  }, [open]);

  const canSubmit = !busy && (file !== null || text.trim().length > 0);

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    try {
      await onSubmit(file ?? text);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="space-y-5">
        {description && <p className="text-xs text-muted-foreground">{description}</p>}

        <section>
          <label className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Upload a file</label>
          <div className="mt-2 flex items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                e.target.value = "";
                setFile(f);
              }}
            />
            <Button variant="outline" onClick={() => fileRef.current?.click()} className="h-10">
              <Upload className="h-3.5 w-3.5" />
              {file ? "Change file" : "Choose JSON file"}
            </Button>
            {file && (
              <span className="truncate font-mono text-xs text-muted-foreground" title={file.name}>
                {file.name}
              </span>
            )}
          </div>
        </section>

        <div className="relative py-1 text-center text-[10px] uppercase tracking-[0.18em] text-text-dim">
          <span className="bg-bg-elevated px-3">or paste JSON</span>
          <div className="absolute inset-x-0 top-1/2 -z-10 h-px bg-border" />
        </div>

        <section>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={placeholder ?? "{…}"}
            spellCheck={false}
            rows={8}
            className="w-full border border-border bg-input/60 p-3 font-mono text-xs text-foreground placeholder:text-text-dim focus-visible:border-accent/60 focus-visible:bg-input focus-visible:outline-none"
          />
          <p className="mt-1 text-[11px] text-muted-foreground">Paste the contents of a previous export. File takes priority if both are filled.</p>
        </section>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy} className="h-10">
            Cancel
          </Button>
          <Button variant="accent" onClick={submit} disabled={!canSubmit} className="h-10">
            {busy ? `${submitLabel ?? "Import"}…` : (submitLabel ?? "Import")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
