import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  HelpCircle,
  Library as LibraryIcon,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  XCircle,
} from "lucide-react";
import type { LibraryHealth, Playlist, ProbeResult, Subtitle, Video, VideoHealth } from "@shared/protocol";
import { PlaylistsSection } from "@/components/PlaylistsSection";
import { useAuth } from "@/auth/AuthContext";
import { api, ApiError } from "@/lib/api";
import { useToast } from "@/components/Toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HealthDot } from "@/components/HealthDot";
import { EditVideoDialog } from "@/components/EditVideoDialog";
import { PlayButton } from "@/components/PlayButton";
import { SubtitleBadge } from "@/components/SubtitleBadge";
import { cn, formatBytes, urlFilename } from "@/lib/utils";

export default function Library() {
  const toast = useToast();
  const [videos, setVideos] = useState<Video[]>([]);
  const [health, setHealth] = useState<LibraryHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");

  const [playlists, setPlaylists] = useState<Playlist[]>([]);

  // Initial load: fetch list + playlists, then auto-fire the health check
  // (no refresh — uses cache).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [list, pls] = await Promise.all([
          api.listVideos(),
          api.listPlaylists().catch(() => [] as Playlist[]),
        ]);
        if (cancelled) return;
        setVideos(list);
        setPlaylists(pls);
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
    try {
      const updated = await api.updateVideo(id, patch);
      setVideos((prev) => prev.map((v) => (v.id === updated.id ? updated : v)));
      void reverify();
    } catch (e) {
      const status = e instanceof ApiError ? e.status : 0;
      toast.error(
        status === 403
          ? "You don't have permission to edit this video."
          : `Couldn't update video. ${(e as Error).message}`,
      );
    }
  };

  const handleRemove = async (id: string) => {
    const video = videos.find((v) => v.id === id);
    try {
      await api.deleteVideo(id);
      setVideos((prev) => prev.filter((v) => v.id !== id));
    } catch (e) {
      const status = e instanceof ApiError ? e.status : 0;
      const label = video?.title || video?.url || "video";
      toast.error(
        status === 403
          ? "You don't have permission to delete videos."
          : `Couldn't delete "${label}". ${(e as Error).message}`,
      );
    }
  };

  const handleClearAll = async () => {
    // Fan out deletes in parallel — no bulk-delete API, but for typical
    // library sizes (tens of entries) this is fine. Track per-item
    // results so we can surface a meaningful aggregate toast and only
    // remove successfully-deleted rows from local state.
    const targets = videos;
    const results = await Promise.all(
      targets.map(async (v) => {
        try {
          await api.deleteVideo(v.id);
          return { id: v.id, ok: true as const };
        } catch (e) {
          return { id: v.id, ok: false as const, err: e };
        }
      }),
    );
    const failed = results.filter((r) => !r.ok);
    const succeededIds = new Set(results.filter((r) => r.ok).map((r) => r.id));
    setVideos((prev) => prev.filter((v) => !succeededIds.has(v.id)));
    setError("");
    if (failed.length > 0) {
      const firstStatus = failed[0]?.err instanceof ApiError ? failed[0].err.status : 0;
      toast.error(
        failed.length === targets.length && firstStatus === 403
          ? "You don't have permission to delete videos."
          : `Couldn't delete ${failed.length} of ${targets.length} videos.`,
      );
    }
  };

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-7 px-4 py-6 sm:px-6 sm:py-8">
      <LibraryHeader
        count={videos.length}
        verifying={verifying}
        onReverify={reverify}
        onClearAll={handleClearAll}
      />

      <section className="border border-border bg-bg-elevated/40 p-6">
        <AddVideoForm onAdd={handleAdd} />
      </section>

      {error && <div className="border border-accent/30 bg-accent/10 p-3 text-sm text-accent">{error}</div>}

      {!loading && (
        <PlaylistsSection playlists={playlists} library={videos} onChange={setPlaylists} />
      )}

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
              <VideoRow
                key={v.id}
                video={v}
                health={health?.videos[v.id]}
                playlists={playlists}
                onUpdate={handleUpdate}
                onRemove={handleRemove}
                onAddToPlaylist={async (playlistId) => {
                  const p = playlists.find((x) => x.id === playlistId);
                  if (!p || p.videoIds.includes(v.id)) return;
                  const updated = await api.updatePlaylist(p.id, { videoIds: [...p.videoIds, v.id] });
                  setPlaylists((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
                }}
              />
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

function LibraryHeader({
  count,
  verifying,
  onReverify,
  onClearAll,
}: {
  count: number;
  verifying: boolean;
  onReverify: () => void;
  onClearAll: () => Promise<void>;
}) {
  const { currentSpace } = useAuth();
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
        <div className="flex flex-col leading-tight">
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {currentSpace?.name ?? "Saved"}
          </span>
          <h1 className="flex items-center gap-2 text-base font-semibold tracking-tight text-foreground">
            <LibraryIcon className="h-4 w-4 text-accent" />
            Library
            <span className="font-mono text-[12px] font-normal text-text-dim">· {count}</span>
          </h1>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
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
  playlists,
  onUpdate,
  onRemove,
  onAddToPlaylist,
}: {
  video: Video;
  health: VideoHealth | undefined;
  playlists: Playlist[];
  onUpdate: (id: string, patch: { title?: string; subtitles?: Subtitle[] }) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  onAddToPlaylist: (playlistId: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
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
          <PlayButton video={video} health={health} />
          {playlists.length > 0 && (
            <div className="relative">
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setMenuOpen((v) => !v)}
                onBlur={() => {
                  // Close on blur but with a small delay so a click inside the
                  // menu still registers before the popover unmounts.
                  setTimeout(() => setMenuOpen(false), 150);
                }}
                aria-label="Add to playlist"
                title="Add to playlist"
              >
                <Plus className="h-4 w-4" />
              </Button>
              {menuOpen && (
                <div className="absolute right-0 top-9 z-30 min-w-[12rem] border border-border bg-bg-elevated/95 shadow-[0_12px_32px_-12px_rgba(0,0,0,0.7)] backdrop-blur-xl">
                  <div className="border-b border-border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-text-dim">
                    Add to…
                  </div>
                  <ul className="max-h-60 overflow-y-auto">
                    {playlists.map((p) => {
                      const already = p.videoIds.includes(video.id);
                      return (
                        <li key={p.id}>
                          <button
                            type="button"
                            disabled={already}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={async () => {
                              setMenuOpen(false);
                              await onAddToPlaylist(p.id);
                            }}
                            className={cn(
                              "flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition",
                              already ? "text-text-dim" : "text-foreground hover:bg-white/[0.04]",
                            )}
                          >
                            <span className="truncate">{p.title}</span>
                            {already && <span className="font-mono text-[10px] text-text-dim">✓</span>}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
          )}
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
