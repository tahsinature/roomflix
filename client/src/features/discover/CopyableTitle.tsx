import { Tooltip } from "@/components/ui/tooltip";
import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { useToast } from "@/components/Toast";
import { cn } from "@/lib/utils";

const COPIED_FEEDBACK_MS = 1_500;

export function CopyableTitle({ title }: { title: string }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
    },
    [],
  );

  const copyTitle = async () => {
    try {
      await navigator.clipboard.writeText(title);
      setCopied(true);
      toast.success(`“${title}” copied.`);
      if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
      resetTimer.current = window.setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
    } catch {
      toast.error("Couldn't copy the title.");
    }
  };

  return (
    <span className="inline-flex min-w-0 max-w-full items-baseline gap-2">
      <span className="min-w-0 text-balance">{title}</span>
      <Tooltip content={copied ? "Copied" : "Copy title"}>
        <button
          type="button"
          onClick={copyTitle}
          aria-label={`Copy title: ${title}`}
          className={cn(
            "inline-flex size-7 shrink-0 translate-y-0.5 items-center justify-center rounded-md transition-colors hover:bg-white/10 hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
            copied ? "text-live" : "text-muted-foreground/50",
          )}
        >
          {copied ? <Check className="size-3.5" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
        </button>
      </Tooltip>
      <span className="sr-only" aria-live="polite">
        {copied ? "Title copied" : ""}
      </span>
    </span>
  );
}
