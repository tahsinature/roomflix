import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { S3Client } from "@aws-sdk/client-s3";
import { AlertTriangle, Database, Loader2, LogOut, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ExportMenu } from "@/components/ExportMenu";
import { ConnectForm } from "@/components/storage/ConnectForm";
import { CorsHint } from "@/components/storage/CorsHint";
import { FileBrowser, LibraryHintBanner } from "@/components/storage/FileBrowser";
import { UploadQueuePanel, type UploadQueueItem } from "@/components/storage/UploadQueuePanel";
import { UsageBar } from "@/components/storage/UsageBar";
import { EditVideoDialog } from "@/components/EditVideoDialog";
import type { Subtitle, Video } from "@shared/protocol";
import {
  browse,
  buildClient,
  computeUsage,
  createFolder,
  deleteFile,
  deleteMany,
  listAllUnderPrefix,
  looksLikeCorsError,
  renameObject,
  renamePrefix,
  uploadFile,
} from "@/lib/buckets/client";
import { configFilename, toConfigFile } from "@/lib/buckets/config_file";
import { clearConnection, loadConnection, reconcileConnection, saveConnection } from "@/lib/buckets/session";
import type { BrowseResult, Connection, FileEntry, Usage } from "@/lib/buckets/types";
import { api } from "@/lib/api";
import { copyJsonToClipboard, downloadJsonFile, openJsonInNewTab } from "@/lib/jsonExport";
import { canonicalUrl, formatBytes } from "@/lib/utils";

type ConnectError = { kind: "auth" | "cors" | "other"; message: string };

export default function Storage() {
  const [connection, setConnection] = useState<Connection | null>(null);
  const [busy, setBusy] = useState(false);
  // True while we resolve the storage connection. Always starts true so we
  // don't flash the "Connect" form for guests (whose localStorage is empty
  // on first paint — the config has to come from the server's space record).
  // The mount effect sets it false once we've either restored, fetched, or
  // confirmed there's nothing to restore.
  const [restoring, setRestoring] = useState(true);
  const [connectError, setConnectError] = useState<ConnectError | null>(null);

  const clientRef = useRef<S3Client | null>(null);
  const [browseResult, setBrowseResult] = useState<BrowseResult | null>(null);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [usage, setUsage] = useState<Usage | null>(null);

  // Library entries indexed by canonical URL — Map (not Set) so a file row
  // that matches can open the entry in the edit modal, not just light up a
  // badge. `null` distinguishes "haven't fetched / fetch failed" from "fetched
  // and empty"; in that case we hide library affordances entirely.
  const [libraryByUrl, setLibraryByUrl] = useState<Map<string, Video> | null>(null);
  const [editingVideo, setEditingVideo] = useState<Video | null>(null);
  // IDs (file keys + folder prefixes) currently mid-delete. Drives the row
  // collapse animation + spinner. Cleared after the row has been removed
  // from the listing, so the row never "un-collapses" mid-deletion.
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  // Surface for mutation errors (delete / create-folder / upload). Shown as a
  // dismissible banner above the file browser so feedback is local instead of
  // disappearing into the connect-error slot.
  const [mutationError, setMutationError] = useState("");

  // Helpers so we don't repeat the Set-copy dance at every callsite.
  const markDeleting = (ids: string[]) =>
    setDeletingIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.add(id);
      return next;
    });
  const unmarkDeleting = (ids: string[]) =>
    setDeletingIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.delete(id);
      return next;
    });
  // Match the CSS transition duration on the rows so the collapse finishes
  // before the row unmounts and the data state catches up.
  const ANIMATION_DELAY_MS = 280;

  // ── Upload queue (lifted out of FileBrowser so the floating panel can
  // persist across navigation inside the bucket).
  const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([]);
  const uploadProcessing = useRef(false);

  // Headroom = max - already-used - bytes-already-committed-to-this-queue.
  // Pre-flight cap check in `acceptFiles` uses this to refuse over-budget files.
  const usedBytes = usage?.bytes ?? 0;
  const committedBytes = uploadQueue.filter((q) => q.status !== "error").reduce((sum, q) => sum + q.file.size, 0);
  const uploadHeadroom = connection ? Math.max(0, connection.maxBytes - usedBytes - committedBytes) : 0;

  const acceptFiles = useCallback(
    (files: FileList | File[]) => {
      const incoming = Array.from(files);
      if (incoming.length === 0 || !connection) return;
      const prefix = browseResult?.prefix ?? "";
      let usedThisDrop = 0;
      const next: UploadQueueItem[] = [];
      for (const file of incoming) {
        if (file.size > uploadHeadroom - usedThisDrop) {
          next.push({
            id: randomQueueId(),
            file,
            prefix,
            status: "error",
            message: `Skipped — would exceed cap (${formatBytes(connection.maxBytes)})`,
          });
        } else {
          next.push({ id: randomQueueId(), file, prefix, status: "pending" });
          usedThisDrop += file.size;
        }
      }
      setUploadQueue((q) => [...q, ...next]);
    },
    [browseResult?.prefix, connection, uploadHeadroom],
  );

  const clearDoneFromQueue = () => setUploadQueue((q) => q.filter((it) => it.status !== "done" && it.status !== "error"));
  const removeFromQueue = (id: string) => setUploadQueue((q) => q.filter((it) => it.id !== id));

  // Sequential processor — picks the first pending item, uploads it, then
  // re-runs from the state change. Skips the LIST refresh in favor of an
  // optimistic local insert so a 10-file drop doesn't trigger 10 LISTs.
  useEffect(() => {
    if (uploadProcessing.current) return;
    const nextItem = uploadQueue.find((q) => q.status === "pending");
    if (!nextItem) return;
    const client = clientRef.current;
    const conn = connection;
    if (!client || !conn) return;
    uploadProcessing.current = true;
    (async () => {
      setUploadQueue((q) => q.map((it) => (it.id === nextItem.id ? { ...it, status: "uploading" } : it)));
      try {
        const key = nextItem.prefix + nextItem.file.name;
        await uploadFile(client, conn.bucket, key, nextItem.file);
        setUploadQueue((q) => q.map((it) => (it.id === nextItem.id ? { ...it, status: "done" } : it)));
        setUsage((u) => (u ? { bytes: u.bytes + nextItem.file.size, objects: u.objects + 1 } : u));
        // Optimistic insert into the current listing if the user is still
        // looking at the prefix where the file was queued — saves a LIST
        // round trip per upload.
        setBrowseResult((prev) => {
          if (!prev || prev.prefix !== nextItem.prefix) return prev;
          if (prev.files.some((f) => f.key === key)) return prev;
          return {
            ...prev,
            files: [...prev.files, { key, size: nextItem.file.size, lastModified: new Date() }].sort((a, b) => a.key.localeCompare(b.key)),
          };
        });
      } catch (err) {
        setUploadQueue((q) =>
          q.map((it) => (it.id === nextItem.id ? { ...it, status: "error", message: (err as Error).message || "Upload failed" } : it)),
        );
      } finally {
        uploadProcessing.current = false;
      }
    })();
  }, [uploadQueue, connection]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Prefer the localStorage cache for instant restore. Falls through
      // to a server-side fetch when empty — that's the path guests take
      // (their first visit has nothing cached), and also any device where
      // the user/guest logged in fresh.
      let saved = loadConnection();
      if (!saved) {
        saved = await reconcileConnection();
        if (cancelled) return;
      }
      if (!saved) {
        setRestoring(false);
        return;
      }
      await attemptConnect(saved, { fromRestore: true });
      if (!cancelled) setRestoring(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refresh the library URL set whenever the connection changes — used for
  // the "In Library" badge. Network failures here aren't fatal; we just leave
  // the set null so the FileBrowser hides the badges silently.
  useEffect(() => {
    if (!connection) {
      setLibraryByUrl(null);
      return;
    }
    let cancelled = false;
    api
      .listVideos()
      .then((vs) => {
        if (cancelled) return;
        // Canonicalize so encoded vs literal characters (e.g. spaces vs %20)
        // don't cause a false-negative match against bucket file URLs.
        setLibraryByUrl(new Map(vs.map((v) => [canonicalUrl(v.url), v])));
      })
      .catch(() => {
        if (!cancelled) setLibraryByUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [connection]);

  const refreshUsage = async (client: S3Client, bucket: string) => {
    try {
      const u = await computeUsage(client, bucket);
      setUsage(u);
    } catch {
      setUsage(null);
    }
  };

  const attemptConnect = useCallback(async (conn: Connection, opts: { fromRestore?: boolean } = {}) => {
    setBusy(true);
    setConnectError(null);
    const client = buildClient(conn);
    try {
      const result = await browse(client, conn.bucket, "");
      clientRef.current = client;
      setConnection(conn);
      setBrowseResult(result);
      saveConnection(conn);
      void refreshUsage(client, conn.bucket);
    } catch (err) {
      if (opts.fromRestore) clearConnection();
      setConnectError(classifyError(err));
    } finally {
      setBusy(false);
    }
  }, []);

  const navigate = async (prefix: string) => {
    const client = clientRef.current;
    const conn = connection;
    if (!client || !conn) return;
    setBrowseLoading(true);
    try {
      const result = await browse(client, conn.bucket, prefix);
      setBrowseResult(result);
    } catch (err) {
      setConnectError(classifyError(err));
    } finally {
      setBrowseLoading(false);
    }
  };

  const refresh = useCallback(() => {
    if (browseResult) void navigate(browseResult.prefix);
    if (clientRef.current && connection) void refreshUsage(clientRef.current, connection.bucket);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [browseResult?.prefix, connection]);

  const disconnect = () => {
    clientRef.current = null;
    setConnection(null);
    setBrowseResult(null);
    setUsage(null);
    setConnectError(null);
    setLibraryByUrl(null);
    clearConnection();
  };

  // ── Mutations ────────────────────────────────────────────────────────

  const handleCreateFolder = async (name: string) => {
    const client = clientRef.current;
    const conn = connection;
    if (!client || !conn || !browseResult) throw new Error("Not connected.");
    const prefix = browseResult.prefix + name;
    await createFolder(client, conn.bucket, prefix);
    refresh();
  };

  const handleDeleteFile = async (key: string) => {
    const client = clientRef.current;
    const conn = connection;
    if (!client || !conn) throw new Error("Not connected.");
    const file = browseResult?.files.find((f) => f.key === key);
    markDeleting([key]);
    try {
      await deleteFile(client, conn.bucket, key);
      setUsage((u) => (u && file ? { bytes: Math.max(0, u.bytes - file.size), objects: Math.max(0, u.objects - 1) } : u));
      // Let the row's collapse animation play, then drop it from local state.
      await new Promise((r) => setTimeout(r, ANIMATION_DELAY_MS));
      setBrowseResult((prev) => (prev ? { ...prev, files: prev.files.filter((f) => f.key !== key) } : prev));
    } catch (err) {
      setMutationError(classifyError(err).message);
      throw err;
    } finally {
      unmarkDeleting([key]);
    }
  };

  // Folder delete: enumerates the prefix, then deletes every key under it.
  // The row's armed-trash UI is the safety gate; no modal in the way.
  const handleDeleteFolder = async (prefix: string) => {
    const client = clientRef.current;
    const conn = connection;
    if (!client || !conn) throw new Error("Not connected.");
    markDeleting([prefix]);
    try {
      const items = await listAllUnderPrefix(client, conn.bucket, prefix);
      const bytes = items.reduce((s, it) => s + it.size, 0);
      const keys = items.map((it) => it.key);
      await deleteMany(client, conn.bucket, keys);
      setUsage((u) => (u ? { bytes: Math.max(0, u.bytes - bytes), objects: Math.max(0, u.objects - keys.length) } : u));
      await new Promise((r) => setTimeout(r, ANIMATION_DELAY_MS));
      setBrowseResult((prev) => (prev ? { ...prev, folders: prev.folders.filter((f) => f.prefix !== prefix) } : prev));
    } catch (err) {
      setMutationError(classifyError(err).message);
      throw err;
    } finally {
      unmarkDeleting([prefix]);
    }
  };

  // Bulk delete: walks each selected ID, expands any folder prefixes via LIST,
  // then deletes the union. All selected rows collapse in unison.
  const handleBulkDelete = async (ids: string[]) => {
    const client = clientRef.current;
    const conn = connection;
    if (!client || !conn || !browseResult) throw new Error("Not connected.");
    markDeleting(ids);
    try {
      const fileMap = new Map(browseResult.files.map((f) => [f.key, f] as const));
      const allItems: FileEntry[] = [];
      for (const id of ids) {
        if (id.endsWith("/")) {
          const sub = await listAllUnderPrefix(client, conn.bucket, id);
          allItems.push(...sub);
        } else {
          const file = fileMap.get(id);
          if (file) allItems.push(file);
        }
      }
      const bytes = allItems.reduce((s, it) => s + it.size, 0);
      const keys = allItems.map((it) => it.key);
      await deleteMany(client, conn.bucket, keys);
      setUsage((u) => (u ? { bytes: Math.max(0, u.bytes - bytes), objects: Math.max(0, u.objects - keys.length) } : u));
      await new Promise((r) => setTimeout(r, ANIMATION_DELAY_MS));
      const idSet = new Set(ids);
      setBrowseResult((prev) =>
        prev
          ? {
              ...prev,
              files: prev.files.filter((f) => !idSet.has(f.key)),
              folders: prev.folders.filter((f) => !idSet.has(f.prefix)),
            }
          : prev,
      );
    } catch (err) {
      setMutationError(classifyError(err).message);
      throw err;
    } finally {
      unmarkDeleting(ids);
    }
  };

  // ── Rename ───────────────────────────────────────────────────────────
  //
  // S3 has no rename; we copy-then-delete server-side via the SDK. The bytes
  // never traverse the browser so even multi-GB renames are fast. After the
  // bucket op succeeds we patch the local listing AND any matching library
  // entry's URL so saved videos keep working.

  const updateLibraryUrlIfNeeded = useCallback(
    async (oldUrl: string, newUrl: string) => {
      const existing = libraryByUrl?.get(canonicalUrl(oldUrl));
      if (!existing) return;
      try {
        const updated = await api.updateVideo(existing.id, { url: newUrl });
        setLibraryByUrl((prev) => {
          const next = new Map(prev ?? []);
          next.delete(canonicalUrl(oldUrl));
          next.set(canonicalUrl(updated.url), updated);
          return next;
        });
      } catch {
        // Surfaced via mutationError elsewhere; renaming the bucket object
        // itself already succeeded, so this is a best-effort follow-up.
      }
    },
    [libraryByUrl],
  );

  const handleRenameFile = async (oldKey: string, newName: string) => {
    const client = clientRef.current;
    const conn = connection;
    if (!client || !conn || !browseResult) throw new Error("Not connected.");
    const prefix = browseResult.prefix;
    const newKey = prefix + newName;
    if (newKey === oldKey) return;
    if (browseResult.files.some((f) => f.key === newKey)) {
      setMutationError(`A file named "${newName}" already exists here.`);
      return;
    }
    try {
      await renameObject(client, conn.bucket, oldKey, newKey);
      const file = browseResult.files.find((f) => f.key === oldKey);
      setBrowseResult((prev) =>
        prev
          ? {
              ...prev,
              files: prev.files.map((f) => (f.key === oldKey ? { ...f, key: newKey } : f)).sort((a, b) => a.key.localeCompare(b.key)),
            }
          : prev,
      );
      if (conn.publicBaseUrl && file) {
        const oldUrl = `${conn.publicBaseUrl.replace(/\/$/, "")}/${oldKey}`;
        const newUrl = `${conn.publicBaseUrl.replace(/\/$/, "")}/${newKey}`;
        await updateLibraryUrlIfNeeded(oldUrl, newUrl);
      }
    } catch (err) {
      setMutationError(classifyError(err).message);
      throw err;
    }
  };

  const handleRenameFolder = async (oldPrefix: string, newName: string) => {
    const client = clientRef.current;
    const conn = connection;
    if (!client || !conn || !browseResult) throw new Error("Not connected.");
    const parent = browseResult.prefix;
    const newPrefix = parent + newName + "/";
    if (newPrefix === oldPrefix) return;
    if (browseResult.folders.some((f) => f.prefix === newPrefix)) {
      setMutationError(`A folder named "${newName}" already exists here.`);
      return;
    }
    try {
      const { oldKeys, newKeys } = await renamePrefix(client, conn.bucket, oldPrefix, newPrefix);
      setBrowseResult((prev) =>
        prev
          ? {
              ...prev,
              folders: prev.folders.map((f) => (f.prefix === oldPrefix ? { prefix: newPrefix } : f)).sort((a, b) => a.prefix.localeCompare(b.prefix)),
            }
          : prev,
      );
      // Walk every key that moved and update any matching library entries.
      if (conn.publicBaseUrl) {
        const base = conn.publicBaseUrl.replace(/\/$/, "");
        for (let i = 0; i < oldKeys.length; i++) {
          await updateLibraryUrlIfNeeded(`${base}/${oldKeys[i]}`, `${base}/${newKeys[i]}`);
        }
      }
    } catch (err) {
      setMutationError(classifyError(err).message);
      throw err;
    }
  };

  // ── Library wiring ───────────────────────────────────────────────────

  const handleAddToLibrary = useCallback(async (url: string) => {
    const created = await api.createVideo({ url });
    // Optimistic update so the badge flips immediately. Canonicalize to
    // match the format used when the map was originally built.
    setLibraryByUrl((prev) => {
      const next = new Map(prev ?? []);
      next.set(canonicalUrl(created.url), created);
      return next;
    });
  }, []);

  // Click handler for the "In library" badge — resolve the URL back to the
  // full Video entry and open it in the shared edit modal.
  const handleOpenLibraryEntry = useCallback(
    (publicUrl: string) => {
      const video = libraryByUrl?.get(canonicalUrl(publicUrl));
      if (video) setEditingVideo(video);
    },
    [libraryByUrl],
  );

  // Library update from inside the edit modal (title, subtitles). Keeps
  // the map in sync so the badge / future opens see the new values.
  const handleUpdateVideo = useCallback(
    async (id: string, patch: { title?: string; subtitles?: Subtitle[] }) => {
      const updated = await api.updateVideo(id, patch);
      setLibraryByUrl((prev) => {
        const next = new Map(prev ?? []);
        next.set(canonicalUrl(updated.url), updated);
        return next;
      });
      setEditingVideo(updated);
    },
    [],
  );

  // Memoize so FileBrowser's diffing doesn't churn on every parent render.
  const matchEnabled = useMemo(() => Boolean(connection?.publicBaseUrl), [connection?.publicBaseUrl]);

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader connection={connection} onDisconnect={disconnect} />

      {restoring ? (
        <RestoringFrame />
      ) : !connection ? (
        <>
          {connectError?.kind === "cors" && <CorsHint />}
          <ConnectForm
            initial={undefined}
            busy={busy}
            error={connectError && connectError.kind !== "cors" ? connectError.message : ""}
            onConnect={(c) => void attemptConnect(c)}
            onImportError={(message) => setConnectError({ kind: "other", message })}
          />
        </>
      ) : (
        <>
          <UsageBar usedBytes={usage?.bytes ?? 0} maxBytes={connection.maxBytes} objects={usage?.objects ?? 0} />
          {mutationError && <MutationErrorBanner message={mutationError} onDismiss={() => setMutationError("")} />}
          {!matchEnabled && <LibraryHintBanner />}
          <FileBrowser
            result={browseResult}
            loading={browseLoading}
            onNavigate={navigate}
            onRefresh={refresh}
            onCreateFolder={handleCreateFolder}
            onDeleteFile={handleDeleteFile}
            onDeleteFolder={handleDeleteFolder}
            onBulkDelete={handleBulkDelete}
            onRenameFile={handleRenameFile}
            onRenameFolder={handleRenameFolder}
            deletingIds={deletingIds}
            headroom={uploadHeadroom}
            onAcceptFiles={acceptFiles}
            publicBaseUrl={connection.publicBaseUrl}
            libraryByUrl={matchEnabled ? libraryByUrl ?? undefined : undefined}
            onAddToLibrary={matchEnabled ? handleAddToLibrary : undefined}
            onOpenLibraryEntry={matchEnabled ? handleOpenLibraryEntry : undefined}
          />
        </>
      )}

      <UploadQueuePanel queue={uploadQueue} onClearDone={clearDoneFromQueue} onRemove={removeFromQueue} />

      {editingVideo && (
        <EditVideoDialog open video={editingVideo} onClose={() => setEditingVideo(null)} onUpdate={handleUpdateVideo} />
      )}
    </main>
  );
}

function randomQueueId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function RestoringFrame() {
  return (
    <div className="flex min-h-[18rem] flex-col items-center justify-center gap-3 border border-border bg-bg-elevated/40 text-center">
      <Loader2 className="h-7 w-7 animate-spin text-accent/90" />
      <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Restoring connection…</span>
    </div>
  );
}

function MutationErrorBanner({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div className="flex items-start justify-between gap-2 border border-accent/30 bg-accent/10 p-3 text-xs">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
        <span className="text-foreground/85">{message}</span>
      </div>
      <button type="button" onClick={onDismiss} className="text-accent/70 transition hover:text-accent" aria-label="Dismiss">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function PageHeader({ connection, onDisconnect }: { connection: Connection | null; onDisconnect: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-5">
      <div className="flex flex-col leading-tight">
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Buckets</span>
        <h1 className="flex items-center gap-2 text-base font-semibold tracking-tight text-foreground">
          <Database className="h-4 w-4 text-accent" />
          Storage
          {connection && (
            <span className="font-mono text-[12px] font-normal text-text-dim">
              · {connection.label || `${connection.provider}/${connection.bucket}`}
            </span>
          )}
        </h1>
      </div>
      {connection && (
        <div className="flex items-center gap-2">
          <ExportMenu
            title="Export connection"
            onCopy={() => copyJsonToClipboard(toConfigFile(connection))}
            onDownload={() => downloadJsonFile(toConfigFile(connection), configFilename(connection))}
            onOpenInTab={() => openJsonInNewTab(toConfigFile(connection))}
          />
          <Button variant="ghost" size="sm" onClick={onDisconnect}>
            <LogOut className="h-3.5 w-3.5" />
            Disconnect
          </Button>
        </div>
      )}
    </div>
  );
}

function classifyError(err: unknown): ConnectError {
  if (looksLikeCorsError(err)) {
    return { kind: "cors", message: "Browser blocked the request — bucket CORS isn't configured." };
  }
  const e = err as { name?: string; message?: string };
  const name = e?.name ?? "";
  if (name === "InvalidAccessKeyId" || name === "SignatureDoesNotMatch") {
    return { kind: "auth", message: "Auth rejected — check your Access Key ID and Secret." };
  }
  if (name === "NoSuchBucket") {
    return { kind: "auth", message: "Bucket not found — check the bucket name and Account ID." };
  }
  return { kind: "other", message: e?.message || String(err) };
}
