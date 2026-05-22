import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Copy, Download, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

// Generic export dropdown — pass any subset of onCopy / onDownload / onOpenInTab
// and only those entries render. Used by Library and Storage to expose the
// same shape with different payloads underneath.
export function ExportMenu({
  disabled,
  title,
  onCopy,
  onDownload,
  onOpenInTab,
}: {
  disabled?: boolean;
  title?: string;
  onCopy?: () => void | Promise<unknown>;
  onDownload?: () => void;
  onOpenInTab?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onEsc);
    return () => {
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  const choose = async (fn?: () => void | Promise<unknown>) => {
    if (!fn) return;
    await fn();
    setOpen(false);
  };

  const handleCopy = async () => {
    if (!onCopy) return;
    await onCopy();
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <Button variant="outline" size="sm" onClick={() => setOpen((o) => !o)} disabled={disabled} aria-label="Export" title={title ?? (disabled ? "Nothing to export" : "Export")}>
        <Download className="h-3.5 w-3.5" />
        <span className="hidden lg:inline">Export</span>
        <ChevronDown className="h-3 w-3 opacity-60" />
      </Button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-2 min-w-[12rem] border border-white/10 bg-[#16181f]/95 p-1 shadow-[0_24px_60px_-12px_rgba(0,0,0,0.85)] backdrop-blur-xl">
          {onCopy && (
            <MenuItem onClick={handleCopy} icon={copied ? <Check className="h-3.5 w-3.5 text-live" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}>
              {copied ? "Copied" : "Copy JSON"}
            </MenuItem>
          )}
          {onDownload && (
            <MenuItem onClick={() => choose(onDownload)} icon={<Download className="h-3.5 w-3.5 text-muted-foreground" />}>
              Download file
            </MenuItem>
          )}
          {onOpenInTab && (
            <MenuItem onClick={() => choose(onOpenInTab)} icon={<ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />}>
              Open in new tab
            </MenuItem>
          )}
        </div>
      )}
    </div>
  );
}

function MenuItem({ onClick, icon, children }: { onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground transition hover:bg-white/[0.04]">
      {icon}
      {children}
    </button>
  );
}
