import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

// Lightweight global toast system. Any component can grab `useToast()`
// and emit transient feedback (errors, confirmations, info). Toasts
// stack top-right (clear of the bottom-right UploadQueuePanel and the
// player at the bottom of /watch). Auto-dismiss after 4s; user can
// dismiss manually with the X.

export type ToastVariant = "error" | "success" | "info";

// Optional inline action — renders as a small accent-coloured button
// between the message and the dismiss "×". Used by "added to library"
// style toasts to give the user a one-click way to view what just
// happened. Clicking the action also dismisses the toast.
export type ToastAction = { label: string; onClick: () => void };

type Toast = {
  id: string;
  variant: ToastVariant;
  message: string;
  action?: ToastAction;
};

type ToastContextValue = {
  show: (variant: ToastVariant, message: string, action?: ToastAction) => string;
  error: (message: string, action?: ToastAction) => string;
  success: (message: string, action?: ToastAction) => string;
  info: (message: string, action?: ToastAction) => string;
  dismiss: (id: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const AUTO_DISMISS_MS = 4000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  // Ref counter avoids two toasts emitted in the same tick getting the
  // same Date.now() id.
  const seq = useRef(0);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback((variant: ToastVariant, message: string, action?: ToastAction) => {
    const id = `t${Date.now()}-${seq.current++}`;
    setToasts((prev) => [...prev, { id, variant, message, action }]);
    return id;
  }, []);

  const error = useCallback((message: string, action?: ToastAction) => show("error", message, action), [show]);
  const success = useCallback((message: string, action?: ToastAction) => show("success", message, action), [show]);
  const info = useCallback((message: string, action?: ToastAction) => show("info", message, action), [show]);

  return (
    <ToastContext.Provider value={{ show, error, success, info, dismiss }}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}

function ToastViewport({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      role="region"
      aria-label="Notifications"
      // Sits above the nav (z 30-ish) and below modals (z 100-ish).
      // pointer-events-none on the wrapper so the empty viewport
      // doesn't block clicks; each toast re-enables them itself.
      className="pointer-events-none fixed right-3 top-3 z-[90] flex max-w-[calc(100vw-1.5rem)] flex-col gap-2 sm:right-4 sm:top-4"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={() => onDismiss(t.id)} />
      ))}
    </div>,
    document.body,
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, [onDismiss]);

  const Icon = toast.variant === "error" ? AlertCircle : toast.variant === "success" ? CheckCircle2 : Info;
  const variantStyles =
    toast.variant === "error" ? "border-accent/50 bg-accent/15" : toast.variant === "success" ? "border-emerald-500/40 bg-emerald-500/10" : "border-border bg-bg-elevated/95";
  const iconStyles = toast.variant === "error" ? "text-accent" : toast.variant === "success" ? "text-emerald-400" : "text-text-dim";

  return (
    <div
      role={toast.variant === "error" ? "alert" : "status"}
      className={cn(
        "pointer-events-auto flex w-[min(22rem,calc(100vw-1.5rem))] items-start gap-3 border px-3 py-2.5 text-foreground shadow-[0_12px_32px_-12px_rgba(0,0,0,0.7)] backdrop-blur-xl animate-fade-in",
        variantStyles,
      )}
    >
      <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", iconStyles)} />
      <p className="min-w-0 flex-1 text-sm leading-relaxed">{toast.message}</p>
      {toast.action && (
        <button
          type="button"
          onClick={() => {
            toast.action?.onClick();
            onDismiss();
          }}
          className="mt-0.5 shrink-0 border border-accent/40 bg-accent/10 px-2 py-0.5 font-mono text-[11px] uppercase tracking-[0.16em] text-accent transition hover:border-accent/70 hover:bg-accent/15"
        >
          {toast.action.label}
        </button>
      )}
      <button type="button" onClick={onDismiss} aria-label="Dismiss" className="flex h-5 w-5 shrink-0 items-center justify-center text-text-dim transition hover:text-foreground">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
