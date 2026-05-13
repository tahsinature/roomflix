import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

// Small icon-only clipboard-copy button. Shows a green check for 1.5s after
// a successful copy. Silent on clipboard rejection (user can select text
// manually) — no failure UI to clutter rows.
export function CopyButton({ text, label, className }: { text: string; label: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      title={copied ? "Copied" : `Copy ${label}`}
      aria-label={copied ? "Copied" : `Copy ${label}`}
      className={cn("shrink-0 p-1.5 text-muted-foreground transition hover:bg-white/[0.05] hover:text-foreground", className)}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-live" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}
