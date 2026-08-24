import { useRef, useState } from "react";
import { FileUp, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/Toast";
import { api } from "@/lib/api";
import { readWatchBridgeLibrary } from "./watchbridge-import";

export function WatchBridgeImportButton({ onImported }: { onImported?: () => Promise<void> }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const importFile = async (file: File) => {
    setBusy(true);
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      const items = readWatchBridgeLibrary(parsed);
      const result = await api.importTitleLibrary(items);
      await onImported?.();
      toast.success(`Imported ${result.imported} title${result.imported === 1 ? "" : "s"}${result.skipped ? `; skipped ${result.skipped}` : ""}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't import that WatchBridge backup.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="application/json,.json"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void importFile(file);
        }}
      />
      <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileUp className="h-3.5 w-3.5" />}
        Import WatchBridge
      </Button>
    </>
  );
}
