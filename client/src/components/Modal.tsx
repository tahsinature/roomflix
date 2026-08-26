import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  headerAction?: ReactNode;
  className?: string;
  overlayClassName?: string;
};

const openModalStack: symbol[] = [];

// Lightweight modal: portal to <body>, backdrop click + Esc to close, body
// scroll locked while open, fade-in. No focus trap (intentional simplicity —
// the use case is small forms, not full-screen workflows).
export function Modal({ open, title, onClose, children, headerAction, className, overlayClassName }: Props) {
  const modalId = useRef(Symbol(title));
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const id = modalId.current;
    openModalStack.push(id);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && openModalStack.at(-1) === id) onCloseRef.current();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    const appScroller = document.getElementById("app-scroll-container");
    const previousAppOverflow = appScroller?.style.overflow;
    document.body.style.overflow = "hidden";
    if (appScroller) appScroller.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      const stackIndex = openModalStack.lastIndexOf(id);
      if (stackIndex >= 0) openModalStack.splice(stackIndex, 1);
      document.body.style.overflow = prev;
      if (appScroller) appScroller.style.overflow = previousAppOverflow ?? "";
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className={cn("fixed inset-0 z-[100] overflow-y-auto overscroll-y-contain bg-black/75 animate-fade-in motion-reduce:animate-none", overlayClassName)} onClick={onClose}>
      <div className="flex min-h-full items-center justify-center p-4 sm:p-8">
        <div
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className={cn("w-full max-w-2xl border border-white/10 bg-[#16181f] shadow-[0_24px_60px_-12px_rgba(0,0,0,0.9)]", className)}
          onClick={(event) => event.stopPropagation()}
        >
          <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
            <h3 className="min-w-0 flex-1 break-words text-xs font-semibold uppercase tracking-[0.18em] text-foreground">{title}</h3>
            <div className="flex shrink-0 items-center gap-2">
              {headerAction}
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="grid h-10 w-10 shrink-0 place-items-center text-muted-foreground transition-colors hover:bg-white/[0.04] hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </header>
          <div className="p-5">{children}</div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
