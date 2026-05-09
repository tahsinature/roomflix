import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  Library as LibraryIcon,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  XCircle,
} from "lucide-react";
import type {
  LibraryHealth,
  ProbeResult,
  RoomListItem,
  Subtitle,
  Video,
  VideoHealth,
} from "@shared/protocol";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { HealthDot } from "@/components/HealthDot";
import { Modal } from "@/components/Modal";
import { PlayButton } from "@/components/PlayButton";
import { cn, urlFilename } from "@/lib/utils";

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
        const [list, rs] = await Promise.all([
          api.listVideos(),
          api.listRooms().catch(() => []),
        ]);
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

  const handleUpdate = async (
    id: string,
    patch: { title?: string; subtitles?: Subtitle[] },
  ) => {
    const updated = await api.updateVideo(id, patch);
    setVideos((prev) => prev.map((v) => (v.id === updated.id ? updated : v)));
    void reverify();
  };

  const handleRemove = async (id: string) => {
    await api.deleteVideo(id);
    setVideos((prev) => prev.filter((v) => v.id !== id));
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
      <LibraryHeader
        count={videos.length}
        verifying={verifying}
        onReverify={reverify}
      />

      <Card className="animate-fade-in">
        <CardContent className="p-6 pt-6">
          <AddVideoForm onAdd={handleAdd} />
        </CardContent>
      </Card>

      {error && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading library…</div>
      ) : videos.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="flex flex-col gap-2">
          {videos.map((v) => (
            <VideoRow
              key={v.id}
              video={v}
              health={health?.videos[v.id]}
              rooms={rooms}
              onUpdate={handleUpdate}
              onRemove={handleRemove}
            />
          ))}
        </ul>
      )}
    </main>
  );
}

function LibraryHeader({
  count,
  verifying,
  onReverify,
}: {
  count: number;
  verifying: boolean;
  onReverify: () => void;
}) {
  return (
    <header className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon">
          <Link to="/" aria-label="Back to home">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground">
            Saved
          </div>
          <h1 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <LibraryIcon className="h-4 w-4 text-violet-300" />
            Library
          </h1>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs text-muted-foreground">
          {count} {count === 1 ? "video" : "videos"}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={onReverify}
          disabled={verifying}
          aria-label="Re-verify library"
        >
          <RefreshCw
            className={cn("h-3.5 w-3.5", verifying && "animate-spin")}
          />
          {verifying ? "Verifying…" : "Verify"}
        </Button>
      </div>
    </header>
  );
}

type AddPhase =
  | { kind: "idle" }
  | { kind: "probing" }
  | { kind: "review"; probe: ProbeResult }
  | { kind: "error"; message: string };

function AddVideoForm({
  onAdd,
}: {
  onAdd: (input: { url: string; title?: string }) => Promise<void>;
}) {
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [phase, setPhase] = useState<AddPhase>({ kind: "idle" });

  const reset = () => {
    setUrl("");
    setTitle("");
    setPhase({ kind: "idle" });
  };

  // Run the actual create. Used by both the auto-add path (verdict ok) and
  // the explicit "Add anyway" override after a review.
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
      // Smooth path: server confirmed video. Just create.
      await create();
      return;
    }
    // uncertain or gone — surface details, let user decide.
    setPhase({ kind: "review", probe });
  };

  const probing = phase.kind === "probing";

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="text-xs uppercase tracking-widest text-muted-foreground">
        Add a video
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
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title (optional)"
          className="sm:w-56"
          disabled={probing}
        />
        <Button
          type="submit"
          variant="accent"
          disabled={!url.trim() || probing}
        >
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

      {phase.kind === "review" && (
        <ProbeReview
          probe={phase.probe}
          onConfirm={() => create(true)}
          onCancel={() => setPhase({ kind: "idle" })}
        />
      )}

      {phase.kind === "error" && (
        <p className="text-xs text-red-300">{phase.message}</p>
      )}
    </form>
  );
}

function ProbeReview({
  probe,
  onConfirm,
  onCancel,
}: {
  probe: ProbeResult;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const isGone = probe.verdict === "gone";
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-md border p-3 text-xs",
        isGone
          ? "border-red-500/30 bg-red-500/10 text-red-200"
          : "border-amber-400/30 bg-amber-400/10 text-amber-200",
      )}
    >
      <div className="flex items-start gap-2">
        {isGone ? (
          <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
        ) : (
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <div className="font-medium">
            {isGone ? "URL not reachable" : "Couldn't confirm this is a video"}
          </div>
          <div className="text-foreground/70">
            {probe.message ?? "No additional information"}
          </div>
          {(probe.contentType || probe.contentLength !== undefined) && (
            <div className="mt-1 font-mono text-[11px] text-foreground/60">
              {probe.contentType ?? "type unknown"}
              {probe.contentLength !== undefined &&
                `  ·  ${formatBytes(probe.contentLength)}`}
            </div>
          )}
        </div>
      </div>
      <div className="flex justify-end gap-1">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          {isGone ? "Edit URL" : "Cancel"}
        </Button>
        {!isGone && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onConfirm}
          >
            Add anyway
          </Button>
        )}
      </div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v < 10 && i > 0 ? v.toFixed(2) : v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
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
  onUpdate: (
    id: string,
    patch: { title?: string; subtitles?: Subtitle[] },
  ) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  // Two-step delete: first click arms (button turns red), second click
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

  const subCount = video.subtitles.length;
  // Subtitle health folded into the edit button's tooltip + an alert tint:
  // if any subtitle URL is broken, the pencil goes red so the user notices
  // without needing a separate button on the row.
  const subtitleAlert = (() => {
    if (subCount === 0 || !health?.subtitles) return false;
    return video.subtitles.some(
      (s) => health.subtitles[s.id] === "gone",
    );
  })();
  const editLabel = subtitleAlert
    ? "Edit video — a subtitle URL is unreachable"
    : "Edit video";

  return (
    <li className="glass rounded-xl p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <HealthDot status={health?.video} />
            <span className="truncate text-sm font-medium text-foreground">
              {video.title}
            </span>
          </div>
          <p
            className="mt-1 truncate font-mono text-xs text-muted-foreground"
            title={video.url}
          >
            {urlFilename(video.url)}
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <PlayButton video={video} rooms={rooms} health={health} />
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setEditOpen(true)}
            aria-label={editLabel}
            title={editLabel}
          >
            <Pencil
              className={cn(
                "h-4 w-4",
                subtitleAlert && "text-red-300",
              )}
            />
          </Button>
          <Button
            size="icon"
            variant={armedDelete ? "destructive" : "ghost"}
            onClick={remove}
            aria-label={armedDelete ? "Click again to confirm delete" : "Delete"}
            title={armedDelete ? "Click again to confirm" : "Delete"}
            disabled={busy}
            className={cn(armedDelete && "animate-pulse")}
          >
            <Trash2
              className={cn(
                "h-4 w-4",
                armedDelete ? "text-white" : "text-red-300",
              )}
            />
          </Button>
        </div>
      </div>

      <EditVideoDialog
        video={video}
        health={health}
        open={editOpen}
        onClose={() => setEditOpen(false)}
        onUpdate={onUpdate}
      />
    </li>
  );
}

function SubtitlesPanel({
  video,
  health,
  onUpdate,
}: {
  video: Video;
  health: VideoHealth | undefined;
  onUpdate: (
    id: string,
    patch: { title?: string; subtitles?: Subtitle[] },
  ) => Promise<void>;
}) {
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [lang, setLang] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const addSubtitle = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;
    setBusy(true);
    setError("");
    try {
      const next: Subtitle[] = [
        ...video.subtitles,
        {
          id: "",
          url: trimmed,
          label: label.trim(),
          lang: lang.trim(),
        },
      ];
      await onUpdate(video.id, { subtitles: next });
      setUrl("");
      setLabel("");
      setLang("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setError("");
    try {
      await onUpdate(video.id, {
        subtitles: video.subtitles.filter((s) => s.id !== id),
      });
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="mt-2 space-y-2 rounded-md border border-white/5 bg-white/[0.02] p-3">
      {video.subtitles.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {video.subtitles.map((s) => (
            <li
              key={s.id}
              className="flex items-center gap-2 rounded-md border border-white/5 bg-white/[0.03] px-2.5 py-1.5"
            >
              <HealthDot status={health?.subtitles?.[s.id]} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-xs font-medium text-foreground/90">
                    {s.label || s.url}
                  </span>
                  {s.lang && (
                    <span className="rounded bg-violet-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-violet-200">
                      {s.lang}
                    </span>
                  )}
                </div>
                <p className="truncate font-mono text-[10px] text-muted-foreground">
                  {s.url}
                </p>
              </div>
              <button
                type="button"
                onClick={() => remove(s.id)}
                aria-label={`Remove ${s.label || s.url}`}
                className="shrink-0 rounded-md p-1 text-muted-foreground transition hover:bg-white/5 hover:text-red-300"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={addSubtitle} className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Subtitle URL (.vtt or .srt)"
          className="h-10 sm:flex-1"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
        />
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Label (e.g. English)"
          className="h-10 sm:w-40"
        />
        <Input
          value={lang}
          onChange={(e) => setLang(e.target.value)}
          placeholder="Lang (e.g. en)"
          className="h-10 sm:w-28"
          autoCapitalize="off"
        />
        <Button
          type="submit"
          variant="outline"
          disabled={!url.trim() || busy}
          className="h-10 shrink-0"
        >
          <Plus className="h-4 w-4" />
          Add
        </Button>
      </form>

      {error && <p className="text-xs text-red-300">{error}</p>}
    </div>
  );
}

// Centralized edit surface for a library entry. Hosts both title editing
// and subtitle management — the row's pencil button and the subtitle pill
// both open this. Subtitle changes are committed per-action (Add/Remove);
// title changes need an explicit Save click so accidental keystrokes don't
// rename the entry.
function EditVideoDialog({
  video,
  health,
  open,
  onClose,
  onUpdate,
}: {
  video: Video;
  health: VideoHealth | undefined;
  open: boolean;
  onClose: () => void;
  onUpdate: (
    id: string,
    patch: { title?: string; subtitles?: Subtitle[] },
  ) => Promise<void>;
}) {
  const [draftTitle, setDraftTitle] = useState(video.title);
  const [savingTitle, setSavingTitle] = useState(false);
  const [titleErr, setTitleErr] = useState("");

  // Reset draft when the underlying video changes (different row reusing
  // dialog) or the dialog reopens after a save.
  useEffect(() => {
    setDraftTitle(video.title);
    setTitleErr("");
  }, [video.id, video.title, open]);

  const dirty = draftTitle.trim() !== video.title && draftTitle.trim() !== "";

  const saveTitle = async () => {
    if (savingTitle || !dirty) return;
    setSavingTitle(true);
    setTitleErr("");
    try {
      await onUpdate(video.id, { title: draftTitle.trim() });
    } catch (err) {
      setTitleErr((err as Error).message);
    } finally {
      setSavingTitle(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Edit video">
      <div className="space-y-6">
        <section>
          <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Title
          </label>
          <div className="mt-2 flex gap-2">
            <Input
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void saveTitle();
              }}
              disabled={savingTitle}
              autoFocus
              className="h-10"
            />
            <Button
              variant={dirty ? "accent" : "outline"}
              onClick={saveTitle}
              disabled={!dirty || savingTitle}
              className="h-10 shrink-0"
            >
              {savingTitle ? "Saving…" : "Save"}
            </Button>
          </div>
          {titleErr && <p className="mt-1 text-xs text-red-300">{titleErr}</p>}
        </section>

        <section>
          <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            URL
          </label>
          <p className="mt-2 truncate font-mono text-xs text-muted-foreground">
            {video.url}
          </p>
        </section>

        <section>
          <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Subtitles
          </label>
          <div className="mt-2">
            <SubtitlesPanel
              video={video}
              health={health}
              onUpdate={onUpdate}
            />
          </div>
        </section>
      </div>
    </Modal>
  );
}

function EmptyState() {
  return (
    <Card>
      <CardContent className="p-10 text-center">
        <div className="text-sm font-medium text-foreground/80">
          No videos saved yet
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Paste a URL into a room or use the form above. New URLs auto-save
          here.
        </p>
      </CardContent>
    </Card>
  );
}

