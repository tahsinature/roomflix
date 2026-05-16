import { useState } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, ChevronDown, Loader2, RotateCw, Upload, X, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn, formatBytes } from "@/lib/utils";
import type { UploadErrorKind } from "@/lib/buckets/client";

export type UploadQueueItem = {
  id: string;
  file: File;
  // Captured at queue time so navigating away mid-upload still lands the
  // file at the prefix the user was looking at when they dropped it.
  prefix: string;
  // "retrying" is a transient waiting-state between attempts — the
  // upload effect parks the item here during backoff and flips it back
  // to "pending" when the timer fires.
  status: "pending" | "uploading" | "retrying" | "done" | "error";
  message?: string;
  // How many attempts have been made (1 = first try in flight). Used
  // both for the "Attempt 2/3" subtext and for terminating auto-retry.
  attempts?: number;
  errorKind?: UploadErrorKind;
};

// Fixed bottom-right floating panel for the upload queue. Portaled to
// body so it escapes the file browser's stacking + scroll containers.
//
// Two layouts:
//   - 1 file  → single compact row, no header (header would just
//               restate what the row already shows).
//   - N files → header with aggregate progress + collapsible file list.
export function UploadQueuePanel({
  queue,
  onClearDone,
  onRemove,
  onRetry,
}: {
  queue: UploadQueueItem[];
  onClearDone: () => void;
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
}) {
  if (queue.length === 0) return null;

  return createPortal(
    <div
      role="region"
      aria-label="Upload queue"
      className="fixed bottom-4 left-4 right-4 z-50 sm:left-auto sm:right-4 sm:w-[min(24rem,calc(100vw-2rem))] border-2 border-white/10 bg-[#16181f]/98 shadow-[0_24px_60px_-12px_rgba(0,0,0,0.85)] backdrop-blur-xl animate-fade-in"
    >
      {queue.length === 1 ? (
        <SinglePanel item={queue[0]!} onRemove={onRemove} onRetry={onRetry} />
      ) : (
        <MultiPanel queue={queue} onClearDone={onClearDone} onRemove={onRemove} onRetry={onRetry} />
      )}
    </div>,
    document.body,
  );
}

function SinglePanel({
  item,
  onRemove,
  onRetry,
}: {
  item: UploadQueueItem;
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
}) {
  const verb = statusVerb(item);
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <RowIcon status={item.status} large />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm text-foreground" title={item.file.name}>
          {item.file.name}
        </div>
        <div className="font-mono text-[11px] text-text-dim">
          {formatBytes(item.file.size)}
          {verb && <span className={cn("ml-2", toneFor(item.status))}>· {item.message ?? verb}</span>}
        </div>
      </div>
      {item.status === "error" && <RetryButton onClick={() => onRetry(item.id)} />}
      {(item.status === "done" || item.status === "error") && <DismissButton onClick={() => onRemove(item.id)} />}
    </div>
  );
}

function MultiPanel({
  queue,
  onClearDone,
  onRemove,
  onRetry,
}: {
  queue: UploadQueueItem[];
  onClearDone: () => void;
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);

  const active = queue.filter(
    (q) => q.status === "pending" || q.status === "uploading" || q.status === "retrying",
  ).length;
  const done = queue.filter((q) => q.status === "done").length;
  const failed = queue.filter((q) => q.status === "error").length;
  const total = queue.length;
  const finishedCount = done + failed;
  const progressPct = total > 0 ? (finishedCount / total) * 100 : 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="flex w-full items-center gap-3 border-b border-border px-4 py-2.5 text-left transition hover:bg-white/[0.03]"
        aria-expanded={!collapsed}
      >
        <AggregateGlyph active={active} done={done} failed={failed} />
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold text-foreground">{headerLabel(active, done, failed, total)}</div>
          <div className="font-mono text-[10px] text-muted-foreground">
            {finishedCount} of {total} files
          </div>
        </div>
        <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", collapsed && "rotate-180")} />
      </button>

      <div className="h-0.5 w-full bg-white/[0.04]">
        <div className="h-full bg-accent transition-all duration-500" style={{ width: `${progressPct}%` }} />
      </div>

      {!collapsed && (
        <>
          <ul className="max-h-[50vh] overflow-y-auto">
            {queue.map((it) => (
              <QueueRow key={it.id} item={it} onRemove={() => onRemove(it.id)} onRetry={() => onRetry(it.id)} />
            ))}
          </ul>
          {finishedCount > 0 && (
            <footer className="flex justify-end border-t border-border px-2 py-1.5">
              <Button variant="ghost" size="sm" onClick={onClearDone}>
                Clear {finishedCount === total ? "all" : "done"}
              </Button>
            </footer>
          )}
        </>
      )}
    </>
  );
}

function AggregateGlyph({ active, done, failed }: { active: number; done: number; failed: number }) {
  if (active > 0) return <Loader2 className="h-4 w-4 shrink-0 animate-spin text-cyan" />;
  if (failed > 0) return <XCircle className="h-4 w-4 shrink-0 text-accent" />;
  if (done > 0) return <CheckCircle2 className="h-4 w-4 shrink-0 text-live" />;
  return <Upload className="h-4 w-4 shrink-0 text-muted-foreground" />;
}

function headerLabel(active: number, done: number, failed: number, total: number): string {
  if (active > 0) return `Uploading… (${active} of ${total})`;
  if (failed > 0 && done === 0) return failed === total ? `All ${total} failed` : `${failed} failed`;
  if (failed > 0) return `Done · ${failed} failed`;
  return `${done} uploaded`;
}

function QueueRow({
  item,
  onRemove,
  onRetry,
}: {
  item: UploadQueueItem;
  onRemove: () => void;
  onRetry: () => void;
}) {
  return (
    <li className="flex items-center gap-3 border-b border-border px-3 py-2 text-xs last:border-b-0">
      <RowIcon status={item.status} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-foreground" title={item.file.name}>
          {item.file.name}
        </div>
        <div className="font-mono text-[10px] text-text-dim">
          {formatBytes(item.file.size)}
          {item.message && <span className={cn("ml-2", toneFor(item.status))}>· {item.message}</span>}
        </div>
      </div>
      {item.status === "error" && <RetryButton onClick={onRetry} />}
      {(item.status === "done" || item.status === "error") && <DismissButton onClick={onRemove} />}
    </li>
  );
}

function RowIcon({ status, large }: { status: UploadQueueItem["status"]; large?: boolean }) {
  const size = large ? "h-4 w-4" : "h-3.5 w-3.5";
  if (status === "uploading") return <Loader2 className={cn(size, "shrink-0 animate-spin text-cyan")} />;
  if (status === "retrying") return <RotateCw className={cn(size, "shrink-0 animate-spin text-amber-400")} />;
  if (status === "done") return <CheckCircle2 className={cn(size, "shrink-0 text-live")} />;
  if (status === "error") return <XCircle className={cn(size, "shrink-0 text-accent")} />;
  return <Upload className={cn(size, "shrink-0 text-text-dim")} />;
}

function RetryButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Retry upload"
      title="Retry upload"
      className="shrink-0 border border-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground transition hover:border-accent/40 hover:text-foreground"
    >
      Retry
    </button>
  );
}

function DismissButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Remove from queue"
      className="shrink-0 p-1 text-muted-foreground transition hover:text-foreground"
    >
      <X className="h-3 w-3" />
    </button>
  );
}

// Default short text per status — shown after the file size when there's
// no explicit per-item message.
function statusVerb(item: UploadQueueItem): string {
  switch (item.status) {
    case "pending":
      return "Queued";
    case "uploading":
      return "Uploading…";
    case "retrying":
      return "Retrying…";
    case "done":
      return "Done";
    case "error":
      return "Failed";
  }
}

function toneFor(status: UploadQueueItem["status"]): string {
  if (status === "error") return "text-accent";
  if (status === "retrying") return "text-amber-400";
  return "text-muted-foreground";
}
