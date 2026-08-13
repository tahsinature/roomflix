import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ChevronDown, HelpCircle, Library as LibraryIcon, Loader2, Pencil, Plus, Share2, Trash2, Upload, XCircle } from "lucide-react";
import type { Collection, LibraryHealth, ProbeResult, Subtitle, Video, VideoHealth } from "@shared/protocol";
import { CollectionsSection } from "@/components/CollectionsSection";
import { useAuth } from "@/auth/AuthContext";
import { api, ApiError } from "@/lib/api";
import { useToast } from "@/components/Toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HealthDot } from "@/components/HealthDot";
import { Modal } from "@/components/Modal";
import { ConfigFileDialog } from "@/components/ConfigFileDialog";
import { EditVideoDialog } from "@/components/EditVideoDialog";
import { PlayButton } from "@/components/PlayButton";
import { ShareDialog } from "@/components/ShareDialog";
import { SubtitleBadge } from "@/components/SubtitleBadge";
import { parseMediaBundleInput, toCreateSubtitles } from "@/lib/mediaBundle";
import { cn, formatBytes, urlFilename } from "@/lib/utils";

type AddMediaInput = { url: string; title?: string; subtitles?: Subtitle[] };
type AddMediaResult = { video: Video; alreadyExists: boolean };

export default function Library() {
  const toast = useToast();
  const [videos, setVideos] = useState<Video[]>([]);
  const [health, setHealth] = useState<LibraryHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");

  const [collections, setCollections] = useState<Collection[]>([]);
  // The add form lives in a modal so the page stays a clean list at rest;
  // opens on the "+ Add" button in the header.
  const [addOpen, setAddOpen] = useState(false);

  // Initial load: fetch list + collections, then auto-fire the health check
  // (no refresh — uses cache).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [list, cols] = await Promise.all([api.listVideos(), api.listCollections().catch(() => [] as Collection[])]);
        if (cancelled) return;
        setVideos(list);
        setCollections(cols);
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

  const handleAdd = async (input: AddMediaInput): Promise<AddMediaResult> => {
    const alreadyExists = videos.some((video) => video.url === input.url.trim());
    const created = await api.createVideo(input);
    setVideos((prev) => {
      const without = prev.filter((v) => v.id !== created.id);
      return [created, ...without];
    });
    void reverify();
    return { video: created, alreadyExists };
  };

  const handleUpdate = async (id: string, patch: { title?: string; subtitles?: Subtitle[] }) => {
    try {
      const updated = await api.updateVideo(id, patch);
      setVideos((prev) => prev.map((v) => (v.id === updated.id ? updated : v)));
      void reverify();
    } catch (e) {
      const status = e instanceof ApiError ? e.status : 0;
      toast.error(status === 403 ? "You don't have permission to edit this video." : `Couldn't update video. ${(e as Error).message}`);
      throw e;
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
      toast.error(status === 403 ? "You don't have permission to delete videos." : `Couldn't delete "${label}". ${(e as Error).message}`);
    }
  };

  const handleClearAll = () => bulkDelete(videos);

  // "Invalid" here means a `gone` health verdict — the URL responded
  // 4xx/5xx, timed out, or network-errored. Deliberately excludes
  // `unverified` (host blocked HEAD): that often hits perfectly
  // playable URLs on HEAD-hostile CDNs, so deleting them would silently
  // wipe healthy entries.
  const handleClearInvalid = () => {
    const targets = videos.filter((v) => health?.videos[v.id]?.video === "gone");
    if (targets.length === 0) return;
    return bulkDelete(targets);
  };

  // Fan-out delete used by both "Clear all" and "Clear invalid". No
  // bulk-delete API exists — for typical library sizes (tens of
  // entries) parallel single deletes are fine. Tracks per-item results
  // so we can surface a meaningful aggregate toast and only drop
  // successfully-deleted rows from local state.
  const bulkDelete = async (targets: Video[]) => {
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
        failed.length === targets.length && firstStatus === 403 ? "You don't have permission to delete videos." : `Couldn't delete ${failed.length} of ${targets.length} videos.`,
      );
    }
  };

  // Append a saved library video to a collection (idempotent on url).
  const handleAddVideoToCollection = async (collectionId: string, video: Video) => {
    const col = collections.find((c) => c.id === collectionId);
    if (!col || col.items.some((it) => it.url === video.url)) return;
    try {
      const updated = await api.updateCollection(col.id, {
        items: [...col.items, { url: video.url, name: video.title }],
      });
      setCollections((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      toast.success(`Added to “${updated.title}”.`);
    } catch (e) {
      const status = e instanceof ApiError ? e.status : 0;
      toast.error(status === 403 ? "You don't have permission to edit that collection." : `Couldn't add to collection. ${(e as Error).message}`);
    }
  };

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-7 px-4 py-6 sm:px-6 sm:py-8">
      <LibraryHeader
        count={videos.length}
        goneCount={health ? videos.filter((v) => health.videos[v.id]?.video === "gone").length : 0}
        verifying={verifying}
        onClearAll={handleClearAll}
        onClearInvalid={handleClearInvalid}
        onAdd={() => setAddOpen(true)}
      />

      {error && <div className="border border-accent/30 bg-accent/10 p-3 text-sm text-accent">{error}</div>}

      {!loading && <CollectionsSection collections={collections} onChange={setCollections} />}

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading library…</div>
      ) : videos.length === 0 ? (
        <EmptyState />
      ) : (
        <section>
          <header className="mb-3 flex items-center justify-between">
            <span className="section-label muted">Saved media</span>
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
                collections={collections}
                onUpdate={handleUpdate}
                onRemove={handleRemove}
                onAddToCollection={(collectionId) => handleAddVideoToCollection(collectionId, v)}
              />
            ))}
          </ul>
        </section>
      )}

      <Modal open={addOpen} title="Add media to your library" onClose={() => setAddOpen(false)} className="max-w-lg">
        <AddVideoForm onAdd={handleAdd} onSuccess={() => setAddOpen(false)} />
      </Modal>
    </main>
  );
}

function LibraryHeader({
  count,
  goneCount,
  verifying,
  onClearAll,
  onClearInvalid,
  onAdd,
}: {
  count: number;
  goneCount: number;
  verifying: boolean;
  onClearAll: () => Promise<void>;
  onClearInvalid: () => Promise<void> | undefined;
  onAdd: () => void;
}) {
  const { currentSpace } = useAuth();

  return (
    <div className="flex flex-col gap-4 border-b border-border pb-5">
      <header className="flex items-center justify-between gap-3">
        <div className="flex flex-col leading-tight">
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{currentSpace?.name ?? "Saved"}</span>
          <h1 className="flex items-center gap-2 text-base font-semibold tracking-tight text-foreground">
            <LibraryIcon className="h-4 w-4 text-accent" />
            Library
            <span className="font-mono text-[12px] font-normal text-text-dim">· {count}</span>
            {/* Verification runs automatically when the library loads
                (and after each add/edit). Inline indicator replaces
                the old manual "Verify" button — the user still gets
                visual feedback that something's happening, no extra
                click needed. */}
            {verifying && (
              <span className="ml-1 inline-flex items-center gap-1.5 font-mono text-[11px] font-normal text-muted-foreground" aria-live="polite">
                <Loader2 className="h-3 w-3 animate-spin" />
                Verifying…
              </span>
            )}
          </h1>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="accent" size="sm" onClick={onAdd} aria-label="Add media">
            <Plus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Add</span>
          </Button>
          <ClearMenu count={count} goneCount={goneCount} onClearAll={onClearAll} onClearInvalid={onClearInvalid} />
        </div>
      </header>
    </div>
  );
}

// Trash dropdown — collapses "Clear invalid" + "Clear all" behind a
// single trigger so the header stays at one destructive surface even
// when health verification produces a count. Both menu items use the
// same two-step arm-then-confirm pattern as the rest of the app:
// first click on a row arms it (label morphs to "Click again to
// confirm"); second click commits. Clicking outside or pressing Esc
// closes the menu and disarms.
function ClearMenu({
  count,
  goneCount,
  onClearAll,
  onClearInvalid,
}: {
  count: number;
  goneCount: number;
  onClearAll: () => Promise<void>;
  onClearInvalid: () => Promise<void> | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [armed, setArmed] = useState<"all" | "invalid" | null>(null);
  const [busy, setBusy] = useState<"all" | "invalid" | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // Close + disarm on outside click / Esc. Mirrors ExportMenu's pattern
  // so the two dropdowns feel identical to use.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setArmed(null);
      }
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setArmed(null);
      }
    };
    window.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onEsc);
    return () => {
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  // Auto-disarm after 3s of inaction — same timeout the standalone
  // buttons had.
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(null), 3000);
    return () => clearTimeout(t);
  }, [armed]);

  const triggerClear = async (kind: "all" | "invalid", action: () => Promise<void> | undefined) => {
    if (busy) return;
    if (armed !== kind) {
      setArmed(kind);
      return;
    }
    setArmed(null);
    setBusy(kind);
    try {
      await action();
      setOpen(false);
    } finally {
      setBusy(null);
    }
  };

  // Disable the whole trigger when there's nothing to clear at all.
  // Once health resolves and surfaces `gone` entries, the menu has
  // value even if the library is otherwise empty (won't happen — count
  // includes gones — but the condition reads cleanly this way).
  const triggerDisabled = count === 0;

  return (
    <div ref={ref} className="relative">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen((o) => !o)}
        disabled={triggerDisabled}
        aria-label="Clear library"
        title={triggerDisabled ? "Library is empty" : "Clear entries"}
      >
        <Trash2 className="h-3.5 w-3.5 text-accent/80" />
        <span className="hidden lg:inline">Clear</span>
        <ChevronDown className="h-3 w-3 opacity-60" />
      </Button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-2 min-w-[14rem] border border-white/10 bg-[#16181f]/95 p-1 shadow-[0_24px_60px_-12px_rgba(0,0,0,0.85)] backdrop-blur-xl">
          {/* "Clear invalid" — only rendered when there's something
              gone. If the library is clean the row would be useless
              and a disabled-row would just be noise. */}
          {goneCount > 0 && (
            <ClearMenuItem
              armed={armed === "invalid"}
              busy={busy === "invalid"}
              disabled={busy !== null && busy !== "invalid"}
              label={`Clear invalid · ${goneCount}`}
              armedLabel="Click again to confirm"
              onClick={() => void triggerClear("invalid", onClearInvalid)}
            />
          )}
          <ClearMenuItem
            armed={armed === "all"}
            busy={busy === "all"}
            disabled={busy !== null && busy !== "all"}
            label={`Clear all · ${count}`}
            armedLabel="Click again to confirm"
            onClick={() => void triggerClear("all", onClearAll)}
          />
        </div>
      )}
    </div>
  );
}

function ClearMenuItem({
  armed,
  busy,
  disabled,
  label,
  armedLabel,
  onClick,
}: {
  armed: boolean;
  busy: boolean;
  disabled: boolean;
  label: string;
  armedLabel: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      className={cn(
        "flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition disabled:cursor-not-allowed disabled:opacity-50",
        armed ? "animate-pulse-soft bg-accent/15 text-accent" : "text-foreground hover:bg-white/[0.04]",
      )}
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" /> : <Trash2 className={cn("h-3.5 w-3.5", armed ? "text-accent" : "text-accent/80")} />}
      <span className="flex-1 whitespace-nowrap">{busy ? "Clearing…" : armed ? armedLabel : label}</span>
    </button>
  );
}

type AddPhase = { kind: "idle" } | { kind: "probing" } | { kind: "review"; probe: ProbeResult } | { kind: "error"; message: string };

// Lives inside the "Add" modal — title is derived from the URL on the
// server side and renamable via the per-row pencil, so a single input is
// all the form needs. Calls onSuccess after a clean add so the host can
// close the modal.
function AddVideoForm({ onAdd, onSuccess }: { onAdd: (input: AddMediaInput) => Promise<AddMediaResult>; onSuccess?: () => void }) {
  const toast = useToast();
  const [url, setUrl] = useState("");
  const [phase, setPhase] = useState<AddPhase>({ kind: "idle" });
  const [importOpen, setImportOpen] = useState(false);

  const reset = () => {
    setUrl("");
    setPhase({ kind: "idle" });
  };

  const create = async () => {
    try {
      await onAdd({ url: url.trim() });
      reset();
      onSuccess?.();
    } catch (err) {
      setPhase({ kind: "error", message: (err as Error).message });
    }
  };

  const importBundle = async (input: File | string) => {
    const parsed = await parseMediaBundleInput(input);
    if (!parsed.ok) {
      toast.error(parsed.reason);
      return;
    }

    try {
      const result = await onAdd({
        url: parsed.media.url,
        title: parsed.media.title,
        subtitles: toCreateSubtitles(parsed.media.subtitles),
      });
      setImportOpen(false);
      reset();
      if (result.alreadyExists) toast.info(`“${result.video.title}” is already in this library.`);
      else toast.success(`Imported “${result.video.title}”.`);
      onSuccess?.();
    } catch (err) {
      toast.error(`Couldn't import media. ${(err as Error).message}`);
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
    <>
      <div className="mb-3 flex justify-end">
        <Button type="button" variant="outline" size="sm" onClick={() => setImportOpen(true)}>
          <Upload className="h-3.5 w-3.5" />
          Import JSON
        </Button>
      </div>

      <ConfigFileDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import media JSON"
        description="Paste media JSON copied from Roomflix, or choose a saved JSON file. The title, media URL, and subtitles will be added to this library."
        placeholder='{"kind":"roomflix-media","version":1,"media":{…}}'
        submitLabel="Import media"
        onSubmit={importBundle}
      />

      <form onSubmit={submit} className="space-y-2">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            autoFocus
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Paste a public media URL…"
            className="sm:flex-1"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            disabled={probing}
          />
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

        {phase.kind === "review" && <ProbeReview probe={phase.probe} onConfirm={create} onCancel={() => setPhase({ kind: "idle" })} />}

        {phase.kind === "error" && <p className="text-xs text-accent">{phase.message}</p>}
      </form>
    </>
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
  collections,
  onUpdate,
  onRemove,
  onAddToCollection,
}: {
  video: Video;
  health: VideoHealth | undefined;
  collections: Collection[];
  onUpdate: (id: string, patch: { title?: string; subtitles?: Subtitle[] }) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  onAddToCollection: (collectionId: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
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

  // A "gone" health status means the URL is unreachable — dim the whole
  // row and block adding a dead entry to a collection.
  const gone = health?.video === "gone";

  return (
    <li className="border-b border-border last:border-b-0">
      <div className={cn("group flex flex-col gap-3 px-4 py-3.5 transition-colors hover:bg-white/[0.02] sm:flex-row sm:items-center", gone && "opacity-55")}>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <HealthDot status={health?.video} />
            <span className="truncate text-sm font-medium text-foreground">{video.title}</span>
            <SubtitleBadge subtitles={video.subtitles} health={health} />
          </div>
          {/* Subtitle URL — hide when it just repeats the title, which is
              the case for most freshly-added entries and reads as noise. */}
          {urlFilename(video.url) !== video.title && (
            <p className="mt-1 truncate font-mono text-xs text-text-dim" title={video.url}>
              {urlFilename(video.url)}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <PlayButton video={video} health={health} />
          {/* Secondary actions fade in on row hover so the list reads as
              "names + Play" at rest, with management within reach. */}
          <div className="flex items-center gap-2 opacity-50 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
            {collections.length > 0 && (
              <div className="relative">
                <Button
                  size="icon"
                  variant="ghost"
                  disabled={gone}
                  onClick={() => setMenuOpen((v) => !v)}
                  onBlur={() => {
                    // Delay so a click inside the menu still registers
                    // before the popover unmounts.
                    setTimeout(() => setMenuOpen(false), 150);
                  }}
                  aria-label="Add to collection"
                  title={gone ? "Unavailable — URL is unreachable" : "Add to collection"}
                >
                  <Plus className="h-4 w-4" />
                </Button>
                {menuOpen && (
                  <div className="absolute right-0 top-9 z-30 min-w-[13rem] border border-border bg-bg-elevated/95 shadow-[0_12px_32px_-12px_rgba(0,0,0,0.7)] backdrop-blur-xl">
                    <div className="border-b border-border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-text-dim">Add to collection</div>
                    <ul className="max-h-60 overflow-y-auto">
                      {collections.map((c) => {
                        const already = c.items.some((it) => it.url === video.url);
                        return (
                          <li key={c.id}>
                            <button
                              type="button"
                              disabled={already}
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={async () => {
                                setMenuOpen(false);
                                await onAddToCollection(c.id);
                              }}
                              className={cn(
                                "flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition",
                                already ? "text-text-dim" : "text-foreground hover:bg-white/[0.04]",
                              )}
                            >
                              <span className="truncate">{c.title}</span>
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
            <Button size="icon" variant="ghost" onClick={() => setShareOpen(true)} aria-label="Share video" title="Create a share link">
              <Share2 className="h-4 w-4" />
            </Button>
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
      </div>

      <EditVideoDialog video={video} health={health} open={editOpen} onClose={() => setEditOpen(false)} onUpdate={onUpdate} />
      {shareOpen && <ShareDialog target={{ kind: "url", url: video.url, title: video.title }} onClose={() => setShareOpen(false)} />}
    </li>
  );
}

function EmptyState() {
  return (
    <div className="border border-border bg-bg-elevated/40 p-10 text-center">
      <div className="text-sm font-medium text-foreground">No media saved yet</div>
      <p className="mt-1.5 text-xs text-muted-foreground">Paste a URL into a room or use the form above. New URLs auto-save here.</p>
      <Link to="/help" className="mt-4 inline-flex items-center gap-1.5 text-xs text-accent transition hover:text-accent-bright">
        <HelpCircle className="h-3 w-3" />
        Don't have a video URL yet? See the hosting guide.
      </Link>
    </div>
  );
}
