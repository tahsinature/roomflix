import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
};

// Lightweight modal: portal to <body>, backdrop click + Esc to close, body
// scroll locked while open, fade-in. No focus trap (intentional simplicity —
// the use case is small forms, not full-screen workflows).
export function Modal({ open, title, onClose, children, className }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm animate-fade-in sm:items-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn("my-8 w-full max-w-2xl overflow-hidden rounded-2xl border border-white/10 bg-card shadow-2xl shadow-black/60", className)}
      >
        <header className="flex items-center justify-between border-b border-white/5 px-5 py-3">
          <h3 className="text-sm font-semibold tracking-tight text-foreground">{title}</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-md p-1 text-muted-foreground transition hover:bg-white/5 hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="p-5">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
