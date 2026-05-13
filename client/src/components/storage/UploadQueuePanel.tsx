import { useState } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, ChevronDown, Loader2, Upload, X, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn, formatBytes } from "@/lib/utils";

export type UploadQueueItem = {
  id: string;
  file: File;
  // Captured at queue time so navigating away mid-upload still lands the
  // file at the prefix the user was looking at when they dropped it.
  prefix: string;
  status: "pending" | "uploading" | "done" | "error";
  message?: string;
};

// Fixed bottom-right floating panel for the upload queue. Portaled to body so
// it escapes the file browser's stacking + scroll containers. Visually heavy
// (strong border, shadow, distinct background) so it doesn't get mistaken
// for a file row. Collapsible header so it shrinks to a tiny status pill
// while uploads run in the background.
export function UploadQueuePanel({
  queue,
  onClearDone,
  onRemove,
}: {
  queue: UploadQueueItem[];
  onClearDone: () => void;
  onRemove: (id: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);

  if (queue.length === 0) return null;

  const active = queue.filter((q) => q.status === "pending" || q.status === "uploading").length;
  const done = queue.filter((q) => q.status === "done").length;
  const failed = queue.filter((q) => q.status === "error").length;
  const total = queue.length;
  const finishedCount = done + failed;
  const progressPct = total > 0 ? (finishedCount / total) * 100 : 0;

  return createPortal(
    <div
      role="region"
      aria-label="Upload queue"
      className="fixed bottom-4 left-4 right-4 z-50 sm:left-auto sm:right-4 sm:w-[min(24rem,calc(100vw-2rem))] border-2 border-white/10 bg-[#16181f]/98 shadow-[0_24px_60px_-12px_rgba(0,0,0,0.85)] backdrop-blur-xl animate-fade-in"
    >
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="flex w-full items-center gap-3 border-b border-border px-4 py-2.5 text-left transition hover:bg-white/[0.03]"
        aria-expanded={!collapsed}
      >
        <StatusGlyph active={active} done={done} failed={failed} />
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold text-foreground">{headerLabel(active, done, failed, total)}</div>
          <div className="font-mono text-[10px] text-muted-foreground">
            {finishedCount} of {total} {total === 1 ? "file" : "files"}
          </div>
        </div>
        <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", collapsed && "rotate-180")} />
      </button>

      {/* Progress sliver — fills as items finish (done or error). */}
      <div className="h-0.5 w-full bg-white/[0.04]">
        <div className="h-full bg-accent transition-all duration-500" style={{ width: `${progressPct}%` }} />
      </div>

      {!collapsed && (
        <>
          <ul className="max-h-[50vh] overflow-y-auto">
            {queue.map((it) => (
              <QueueRow key={it.id} item={it} onRemove={() => onRemove(it.id)} />
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
    </div>,
    document.body,
  );
}

function StatusGlyph({ active, done, failed }: { active: number; done: number; failed: number }) {
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

function QueueRow({ item, onRemove }: { item: UploadQueueItem; onRemove: () => void }) {
  const icon =
    item.status === "uploading" ? (
      <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-cyan" />
    ) : item.status === "done" ? (
      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-live" />
    ) : item.status === "error" ? (
      <XCircle className="h-3.5 w-3.5 shrink-0 text-accent" />
    ) : (
      <Upload className="h-3.5 w-3.5 shrink-0 text-text-dim" />
    );

  return (
    <li className="flex items-center gap-3 border-b border-border px-3 py-2 text-xs last:border-b-0">
      {icon}
      <div className="min-w-0 flex-1">
        <div className="truncate text-foreground" title={item.file.name}>
          {item.file.name}
        </div>
        <div className="font-mono text-[10px] text-text-dim">
          {formatBytes(item.file.size)}
          {item.message && <span className={cn("ml-2", item.status === "error" ? "text-accent" : "text-muted-foreground")}>· {item.message}</span>}
        </div>
      </div>
      {(item.status === "done" || item.status === "error") && (
        <button type="button" onClick={onRemove} aria-label="Remove from queue" className="shrink-0 p-1 text-muted-foreground transition hover:text-foreground">
          <X className="h-3 w-3" />
        </button>
      )}
    </li>
  );
}
