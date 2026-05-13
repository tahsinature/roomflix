import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  Database,
  HelpCircle,
  Library as LibraryIcon,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
  XCircle,
} from "lucide-react";
import type { LibraryExportV1, LibraryHealth, LibraryImportResult, ProbeResult, RoomListItem, Subtitle, Video, VideoHealth } from "@shared/protocol";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HealthDot } from "@/components/HealthDot";
import { ConfigFileDialog } from "@/components/ConfigFileDialog";
import { EditVideoDialog } from "@/components/EditVideoDialog";
import { ExportMenu } from "@/components/ExportMenu";
import { PlayButton } from "@/components/PlayButton";
import { SubtitleBadge } from "@/components/SubtitleBadge";
import { copyJsonToClipboard, downloadJsonFile, openJsonInNewTab } from "@/lib/jsonExport";
import { cn, formatBytes, urlFilename } from "@/lib/utils";

export default function Library() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [rooms, setRooms] = useState<RoomListItem[]>([]);
  const [health, setHealth] = useState<LibraryHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");

  // Initial load: fetch list + rooms (for join detection) + auto-fire
  // health check (no refresh — uses cache).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [list, rs] = await Promise.all([api.listVideos(), api.listRooms().catch(() => [])]);
        if (cancelled) return;
        setVideos(list);
        setRooms(rs);
        setLoading(false);
        setVerifying(true);
        const h = await api.libraryHealth();
        if (cancelled) return;
        setHealth(h);
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      } finally {
        if (!cancelled) {
          setLoading(false);
          setVerifying(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const reverify = async () => {
    setVerifying(true);
    setError("");
    try {
      const h = await api.libraryHealth({ refresh: true });
      setHealth(h);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setVerifying(false);
    }
  };

  const handleAdd = async (input: { url: string; title?: string }) => {
    const created = await api.createVideo(input);
    setVideos((prev) => {
      const without = prev.filter((v) => v.id !== created.id);
      return [created, ...without];
    });
    void reverify();
  };

  const handleUpdate = async (id: string, patch: { title?: string; subtitles?: Subtitle[] }) => {
    const updated = await api.updateVideo(id, patch);
    setVideos((prev) => prev.map((v) => (v.id === updated.id ? updated : v)));
    void reverify();
  };

  const handleRemove = async (id: string) => {
    await api.deleteVideo(id);
    setVideos((prev) => prev.filter((v) => v.id !== id));
  };

  const handleClearAll = async () => {
    // Fan out deletes in parallel — no bulk-delete API, but for typical
    // library sizes (tens of entries) this is fine. Individual failures
    // are swallowed so one bad row doesn't strand the rest.
    const targets = videos;
    await Promise.all(targets.map((v) => api.deleteVideo(v.id).catch(() => undefined)));
    setVideos([]);
    setError("");
  };

  const buildExportPayload = (): LibraryExportV1 => ({
    version: 1,
    exportedAt: Date.now(),
    videos: videos.map((v) => ({
      url: v.url,
      title: v.title,
      subtitles: v.subtitles.map((s) => ({
        url: s.url,
        label: s.label,
        lang: s.lang,
      })),
    })),
  });
  const exportFilename = () => `roomflix-library-${new Date().toISOString().slice(0, 10)}.json`;
  const exportCopy = () => copyJsonToClipboard(buildExportPayload());
  const exportDownload = () => downloadJsonFile(buildExportPayload(), exportFilename());
  const exportOpenInTab = () => openJsonInNewTab(buildExportPayload());

  const [importStatus, setImportStatus] = useState<{ kind: "idle" } | { kind: "running" } | { kind: "done"; result: LibraryImportResult } | { kind: "error"; message: string }>({
    kind: "idle",
  });

  const handleImport = async (input: File | string) => {
    setImportStatus({ kind: "running" });
    try {
      const text = typeof input === "string" ? input : await input.text();
      if (!text.trim()) throw new Error("Nothing to import.");
      const parsed = JSON.parse(text) as Partial<LibraryExportV1>;
      if (!parsed || !Array.isArray(parsed.videos)) {
        throw new Error("Doesn't look like a Roomflix library export — expected a JSON object with a `videos` array.");
      }
      const result = await api.importLibrary({
        version: 1,
        exportedAt: parsed.exportedAt ?? Date.now(),
        videos: parsed.videos,
      });
      const list = await api.listVideos();
      setVideos(list);
      setImportStatus({ kind: "done", result });
      void reverify();
    } catch (err) {
      setImportStatus({ kind: "error", message: (err as Error).message });
    }
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-7 px-4 py-6 sm:px-6 sm:py-10">
      <LibraryHeader
        count={videos.length}
        verifying={verifying}
        onReverify={reverify}
        onExportCopy={exportCopy}
        onExportDownload={exportDownload}
        onExportOpenInTab={exportOpenInTab}
        onImport={handleImport}
        onClearAll={handleClearAll}
        importStatus={importStatus}
        onDismissImportStatus={() => setImportStatus({ kind: "idle" })}
      />

      <section className="border border-border bg-bg-elevated/40 p-6">
        <AddVideoForm onAdd={handleAdd} />
      </section>

      {error && <div className="border border-accent/30 bg-accent/10 p-3 text-sm text-accent">{error}</div>}

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading library…</div>
      ) : videos.length === 0 ? (
        <EmptyState />
      ) : (
        <section>
          <header className="mb-3 flex items-center justify-between">
            <span className="section-label muted">Saved videos</span>
            <span className="font-mono text-[11px] text-text-dim">
              {videos.length} {videos.length === 1 ? "entry" : "entries"}
            </span>
          </header>
          <ul className="border-y border-border">
            {videos.map((v) => (
              <VideoRow key={v.id} video={v} health={health?.videos[v.id]} rooms={rooms} onUpdate={handleUpdate} onRemove={handleRemove} />
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

type ImportStatus = { kind: "idle" } | { kind: "running" } | { kind: "done"; result: LibraryImportResult } | { kind: "error"; message: string };

function LibraryHeader({
  count,
  verifying,
  onReverify,
  onExportCopy,
  onExportDownload,
  onExportOpenInTab,
  onImport,
  onClearAll,
  importStatus,
  onDismissImportStatus,
}: {
  count: number;
  verifying: boolean;
  onReverify: () => void;
  onExportCopy: () => Promise<boolean>;
  onExportDownload: () => void;
  onExportOpenInTab: () => void;
  onImport: (input: File | string) => Promise<void>;
  onClearAll: () => Promise<void>;
  importStatus: ImportStatus;
  onDismissImportStatus: () => void;
}) {
  const [importOpen, setImportOpen] = useState(false);
  const [armedClear, setArmedClear] = useState(false);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    if (!armedClear) return;
    const t = setTimeout(() => setArmedClear(false), 3000);
    return () => clearTimeout(t);
  }, [armedClear]);

  const triggerClear = async () => {
    if (clearing || count === 0) return;
    if (!armedClear) {
      setArmedClear(true);
      return;
    }
    setArmedClear(false);
    setClearing(true);
    try {
      await onClearAll();
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 border-b border-border pb-5">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon">
            <Link to="/" aria-label="Back to home">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="flex flex-col leading-tight">
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Saved</span>
            <h1 className="flex items-center gap-2 text-base font-semibold tracking-tight text-foreground">
              <LibraryIcon className="h-4 w-4 text-accent" />
              Library
              <span className="font-mono text-[12px] font-normal text-text-dim">· {count}</span>
            </h1>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button asChild variant="ghost" size="sm" aria-label="Open Storage" title="Open Storage">
            <Link to="/storage">
              <Database className="h-3.5 w-3.5" />
              <span className="hidden lg:inline">Storage</span>
            </Link>
          </Button>
          <Button variant="outline" size="sm" onClick={() => setImportOpen(true)} disabled={importStatus.kind === "running"} aria-label="Import library" title="Import library">
            <Upload className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">Import</span>
          </Button>
          <ExportMenu
            disabled={count === 0}
            title={count === 0 ? "Nothing to export" : "Export library"}
            onCopy={onExportCopy}
            onDownload={onExportDownload}
            onOpenInTab={onExportOpenInTab}
          />
          <Button variant="outline" size="sm" onClick={onReverify} disabled={verifying} aria-label="Re-verify library">
            <RefreshCw className={cn("h-3.5 w-3.5", verifying && "animate-spin")} />
            <span className="hidden lg:inline">{verifying ? "Verifying…" : "Verify"}</span>
          </Button>
          <Button
            variant={armedClear ? "destructive" : "ghost"}
            size="sm"
            onClick={triggerClear}
            disabled={count === 0 || clearing}
            aria-label={armedClear ? "Click again to clear library" : "Clear library"}
            title={count === 0 ? "Library is empty" : armedClear ? "Click again to confirm" : "Delete all entries"}
            className={cn(armedClear && "animate-pulse-soft")}
          >
            {clearing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className={cn("h-3.5 w-3.5", !armedClear && "text-accent/80")} />
            )}
            <span className="hidden lg:inline">{clearing ? "Clearing…" : armedClear ? "Click again" : "Clear all"}</span>
          </Button>
        </div>
      </header>

      {importStatus.kind !== "idle" && <ImportStatusBanner status={importStatus} onDismiss={onDismissImportStatus} />}

      <ConfigFileDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import library"
        placeholder='{"version":1,"videos":[…]}'
        onSubmit={async (input) => {
          setImportOpen(false);
          await onImport(input);
        }}
      />
    </div>
  );
}

function ImportStatusBanner({ status, onDismiss }: { status: Exclude<ImportStatus, { kind: "idle" }>; onDismiss: () => void }) {
  if (status.kind === "running") {
    return (
      <div className="flex items-center gap-2 border border-border bg-white/[0.03] p-3 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Importing library…
      </div>
    );
  }
  if (status.kind === "error") {
    return (
      <div className="flex items-start justify-between gap-2 border border-accent/30 bg-accent/10 p-3 text-xs text-accent">
        <div>
          <div className="font-medium">Import failed</div>
          <div className="text-foreground/70">{status.message}</div>
        </div>
        <button type="button" onClick={onDismiss} className="text-accent/70 hover:text-accent" aria-label="Dismiss">
          ✕
        </button>
      </div>
    );
  }
  const { imported, updated, skipped, errors } = status.result;
  const parts = [`Added ${imported}`, `Updated ${updated}`, `Unchanged ${skipped}`];
  if (errors.length > 0) {
    parts.push(`${errors.length} error${errors.length === 1 ? "" : "s"}`);
  }
  return (
    <div className="flex items-start justify-between gap-2 border border-live/30 bg-live/10 p-3 text-xs text-live">
      <div>
        <div className="font-medium">Import complete</div>
        <div className="text-foreground/80">{parts.join(" · ")}</div>
        {errors.length > 0 && (
          <ul className="mt-1 list-disc pl-4 text-amber-200/80">
            {errors.slice(0, 3).map((e, i) => (
              <li key={i} className="truncate">
                {e.url || "(no url)"}: {e.reason}
              </li>
            ))}
            {errors.length > 3 && <li className="text-foreground/60">…and {errors.length - 3} more</li>}
          </ul>
        )}
      </div>
      <button type="button" onClick={onDismiss} className="text-live/70 hover:text-live" aria-label="Dismiss">
        ✕
      </button>
    </div>
  );
}

type AddPhase = { kind: "idle" } | { kind: "probing" } | { kind: "review"; probe: ProbeResult } | { kind: "error"; message: string };

function AddVideoForm({ onAdd }: { onAdd: (input: { url: string; title?: string }) => Promise<void> }) {
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [phase, setPhase] = useState<AddPhase>({ kind: "idle" });

  const reset = () => {
    setUrl("");
    setTitle("");
    setPhase({ kind: "idle" });
  };

  const create = async (skipProbeReset = false) => {
    try {
      await onAdd({ url: url.trim(), title: title.trim() || undefined });
      if (!skipProbeReset) reset();
      else reset();
    } catch (err) {
      setPhase({ kind: "error", message: (err as Error).message });
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;
    setPhase({ kind: "probing" });

    let probe: ProbeResult;
    try {
      probe = await api.probeUrl(trimmed);
    } catch (err) {
      setPhase({ kind: "error", message: (err as Error).message });
      return;
    }

    if (probe.verdict === "ok") {
      await create();
      return;
    }
    setPhase({ kind: "review", probe });
  };

  const probing = phase.kind === "probing";

  return (
    <form onSubmit={submit} className="space-y-3.5">
      <div className="flex items-center justify-between gap-2">
        <span className="section-label muted">Add a video</span>
        <Link to="/help" className="inline-flex items-center gap-1 text-[11px] text-muted-foreground transition hover:text-foreground" title="How to host your video">
          <HelpCircle className="h-3 w-3" />
          Need a URL?
        </Link>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Public video URL (.mp4, .webm, …)"
          className="sm:flex-1"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          disabled={probing}
        />
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (optional)" className="sm:w-56" disabled={probing} />
        <Button type="submit" variant="accent" disabled={!url.trim() || probing} className="h-11">
          {probing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Checking…
            </>
          ) : (
            <>
              <Plus className="h-4 w-4" />
              Add
            </>
          )}
        </Button>
      </div>

      {phase.kind === "review" && <ProbeReview probe={phase.probe} onConfirm={() => create(true)} onCancel={() => setPhase({ kind: "idle" })} />}

      {phase.kind === "error" && <p className="text-xs text-accent">{phase.message}</p>}
    </form>
  );
}

function ProbeReview({ probe, onConfirm, onCancel }: { probe: ProbeResult; onConfirm: () => void; onCancel: () => void }) {
  const isGone = probe.verdict === "gone";
  return (
    <div className={cn("flex flex-col gap-2 border p-3 text-xs", isGone ? "border-accent/30 bg-accent/10 text-accent" : "border-amber-300/30 bg-amber-300/10 text-amber-200")}>
      <div className="flex items-start gap-2">
        {isGone ? <XCircle className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
        <div className="min-w-0 flex-1">
          <div className="font-medium">{isGone ? "URL not reachable" : "Couldn't confirm this is a video"}</div>
          <div className="text-foreground/80">{probe.message ?? "No additional information"}</div>
          {(probe.contentType || probe.contentLength !== undefined) && (
            <div className="mt-1 font-mono text-[11px] text-foreground/60">
              {probe.contentType ?? "type unknown"}
              {probe.contentLength !== undefined && `  ·  ${formatBytes(probe.contentLength)}`}
            </div>
          )}
        </div>
      </div>
      <div className="flex justify-end gap-1">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          {isGone ? "Edit URL" : "Cancel"}
        </Button>
        {!isGone && (
          <Button type="button" variant="outline" size="sm" onClick={onConfirm}>
            Add anyway
          </Button>
        )}
      </div>
    </div>
  );
}

function VideoRow({
  video,
  health,
  rooms,
  onUpdate,
  onRemove,
}: {
  video: Video;
  health: VideoHealth | undefined;
  rooms: RoomListItem[];
  onUpdate: (id: string, patch: { title?: string; subtitles?: Subtitle[] }) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  // Two-step delete: first click arms (button turns coral), second click
  // commits. Auto-disarms after 3s of no follow-up.
  const [armedDelete, setArmedDelete] = useState(false);
  useEffect(() => {
    if (!armedDelete) return;
    const t = setTimeout(() => setArmedDelete(false), 3000);
    return () => clearTimeout(t);
  }, [armedDelete]);

  const remove = async () => {
    if (busy) return;
    if (!armedDelete) {
      setArmedDelete(true);
      return;
    }
    setArmedDelete(false);
    setBusy(true);
    try {
      await onRemove(video.id);
    } catch {
      setBusy(false);
    }
  };

  return (
    <li className="border-b border-border last:border-b-0">
      <div className="flex flex-col gap-3 px-4 py-3.5 transition-colors hover:bg-white/[0.02] sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <HealthDot status={health?.video} />
            <span className="truncate text-sm font-medium text-foreground">{video.title}</span>
            <SubtitleBadge subtitles={video.subtitles} health={health} />
          </div>
          <p className="mt-1 truncate font-mono text-xs text-text-dim" title={video.url}>
            {urlFilename(video.url)}
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <PlayButton video={video} rooms={rooms} health={health} />
          <Button size="icon" variant="ghost" onClick={() => setEditOpen(true)} aria-label="Edit video" title="Edit video">
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant={armedDelete ? "destructive" : "ghost"}
            onClick={remove}
            aria-label={armedDelete ? "Click again to confirm delete" : "Delete"}
            title={armedDelete ? "Click again to confirm" : "Delete"}
            disabled={busy}
            className={cn(armedDelete && "animate-pulse-soft")}
          >
            <Trash2 className={cn("h-4 w-4", armedDelete ? "text-white" : "text-accent/80")} />
          </Button>
        </div>
      </div>

      <EditVideoDialog video={video} health={health} open={editOpen} onClose={() => setEditOpen(false)} onUpdate={onUpdate} />
    </li>
  );
}

function EmptyState() {
  return (
    <div className="border border-border bg-bg-elevated/40 p-10 text-center">
      <div className="text-sm font-medium text-foreground">No videos saved yet</div>
      <p className="mt-1.5 text-xs text-muted-foreground">Paste a URL into a room or use the form above. New URLs auto-save here.</p>
      <Link to="/help" className="mt-4 inline-flex items-center gap-1.5 text-xs text-accent transition hover:text-accent-bright">
        <HelpCircle className="h-3 w-3" />
        Don't have a video URL yet? See the hosting guide.
      </Link>
    </div>
  );
}
