import { useEffect, useRef, useState } from "react";
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
    <button
      type="button"
      onClick={copyTitle}
      aria-label={`Copy title: ${title}`}
      title="Copy title"
      className={cn(
        "group relative -mx-2 -my-1 inline-flex min-w-0 max-w-full cursor-copy items-baseline border border-transparent px-2 py-1 text-left backdrop-blur-md transition-[color,background-color,border-color,box-shadow] duration-200 focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-card",
        copied
          ? "border-live/30 bg-live/[0.07] text-live shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_10px_30px_-18px_rgba(0,0,0,0.9)]"
          : "hover:border-white/15 hover:bg-white/[0.055] hover:text-white hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_12px_32px_-20px_rgba(0,0,0,0.95)] focus-visible:border-white/15 focus-visible:bg-white/[0.055]",
      )}
    >
      <span className="min-w-0 text-balance">{title}</span>
      <span
        className={cn(
          "pointer-events-none absolute bottom-full left-0 mb-2 border px-2 py-1 font-mono text-[8px] font-normal uppercase tracking-[0.14em] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_12px_30px_-14px_rgba(0,0,0,0.95)] backdrop-blur-xl transition-[opacity,transform] duration-150",
          copied
            ? "translate-y-0 border-live/35 bg-[#0b0d12]/70 text-live opacity-100"
            : "translate-y-1 border-white/15 bg-[#0b0d12]/65 text-white/75 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100",
        )}
        aria-hidden="true"
      >
        {copied ? "Copied" : "Copy title"}
      </span>
      <span className="sr-only" aria-live="polite">
        {copied ? "Title copied" : ""}
      </span>
    </button>
  );
}
