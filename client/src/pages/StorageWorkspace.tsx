import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { S3Client } from "@aws-sdk/client-s3";
import { AlertTriangle, X } from "lucide-react";
import type { Collection, CollectionItem, Subtitle, Video } from "@shared/protocol";
import { FileBrowser, LibraryHintBanner, publicUrlForKey, type CollectionTarget } from "@/components/storage/FileBrowser";
import { UploadQueuePanel, type UploadQueueItem } from "@/components/storage/UploadQueuePanel";
import { UsageBar } from "@/components/storage/UsageBar";
import { EditVideoDialog } from "@/components/EditVideoDialog";
import {
  browse,
  buildClient,
  classifyUploadError,
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
import type { BrowseResult, Connection, FileEntry, Usage } from "@/lib/buckets/types";
import { api } from "@/lib/api";
import { useToast } from "@/components/Toast";
import { canonicalUrl, formatBytes, isMediaUrl } from "@/lib/utils";

type ConnectError = { kind: "auth" | "cors" | "other"; message: string };

// Drill-in workspace for a single storage connection. Receives the
// fully-resolved Connection (incl. cleartext secret fetched via ECDH)
// from the parent Storage list page — this component just operates on
// the bucket. Browse, upload, delete, rename, library matching all
// live here.
//
// Loading/restoring/reconnecting is the caller's concern; this
// component renders the workspace UI given a working connection.
export function StorageWorkspace({ connection }: { connection: Connection }) {
  const toast = useToast();
  const clientRef = useRef<S3Client | null>(null);
  const [busy, setBusy] = useState(true);
  const [connectError, setConnectError] = useState<ConnectError | null>(null);
  const [browseResult, setBrowseResult] = useState<BrowseResult | null>(null);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [libraryByUrl, setLibraryByUrl] = useState<Map<string, Video> | null>(null);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [editingVideo, setEditingVideo] = useState<Video | null>(null);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [mutationError, setMutationError] = useState("");

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
  const ANIMATION_DELAY_MS = 280;

  const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([]);
  const uploadProcessing = useRef(false);

  const usedBytes = usage?.bytes ?? 0;
  const committedBytes = uploadQueue.filter((q) => q.status !== "error").reduce((sum, q) => sum + q.file.size, 0);
  const uploadHeadroom = Math.max(0, connection.maxBytes - usedBytes - committedBytes);

  const acceptFiles = useCallback(
    (files: FileList | File[]) => {
      const incoming = Array.from(files);
      if (incoming.length === 0) return;
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
    [browseResult?.prefix, connection.maxBytes, uploadHeadroom],
  );

  const clearDoneFromQueue = () => setUploadQueue((q) => q.filter((it) => it.status !== "done" && it.status !== "error"));
  const removeFromQueue = (id: string) => setUploadQueue((q) => q.filter((it) => it.id !== id));
  // Manual retry — reset attempts so the auto-retry budget refreshes,
  // and let the upload processor pick the item up again on its next tick.
  const retryFromQueue = (id: string) =>
    setUploadQueue((q) => q.map((it) => (it.id === id ? { ...it, status: "pending", attempts: 0, message: undefined, errorKind: undefined } : it)));

  // Sequential upload processor — picks the first pending item.
  //
  // Auto-retry policy: on a network-shaped failure (Wi-Fi blip, fetch
  // abort, CORS preflight) we retry up to MAX_AUTO_ATTEMPTS with
  // exponential backoff (1s / 2s / 4s). Config / size / unknown errors
  // skip auto-retry — those won't get better by trying again, so we
  // mark them terminal and let the user fix the underlying issue (then
  // hit the Retry button on the row).
  useEffect(() => {
    const MAX_AUTO_ATTEMPTS = 3;
    const RETRY_BASE_MS = 1000;

    if (uploadProcessing.current) return;
    const nextItem = uploadQueue.find((q) => q.status === "pending");
    if (!nextItem) return;
    const client = clientRef.current;
    if (!client) return;
    uploadProcessing.current = true;
    (async () => {
      const attempts = (nextItem.attempts ?? 0) + 1;
      setUploadQueue((q) => q.map((it) => (it.id === nextItem.id ? { ...it, status: "uploading", attempts, message: undefined } : it)));
      try {
        const key = nextItem.prefix + nextItem.file.name;
        await uploadFile(client, connection.bucket, key, nextItem.file);
        setUploadQueue((q) => q.map((it) => (it.id === nextItem.id ? { ...it, status: "done" } : it)));
        setUsage((u) => (u ? { bytes: u.bytes + nextItem.file.size, objects: u.objects + 1 } : u));
        setBrowseResult((prev) => {
          if (!prev || prev.prefix !== nextItem.prefix) return prev;
          if (prev.files.some((f) => f.key === key)) return prev;
          return {
            ...prev,
            files: [...prev.files, { key, size: nextItem.file.size, lastModified: new Date() }].sort((a, b) => a.key.localeCompare(b.key)),
          };
        });
      } catch (err) {
        const { kind, label } = classifyUploadError(err);
        const canAutoRetry = kind === "network" && attempts < MAX_AUTO_ATTEMPTS;
        if (canAutoRetry) {
          const delaySec = Math.round((RETRY_BASE_MS * 2 ** (attempts - 1)) / 1000);
          setUploadQueue((q) =>
            q.map((it) =>
              it.id === nextItem.id
                ? {
                    ...it,
                    status: "retrying",
                    errorKind: kind,
                    message: `${label} — retrying in ${delaySec}s (attempt ${attempts + 1}/${MAX_AUTO_ATTEMPTS})`,
                  }
                : it,
            ),
          );
          // Flip back to "pending" after backoff. Guard against the
          // user removing/retrying the item during the wait — only
          // resume if it's still in "retrying".
          setTimeout(() => {
            setUploadQueue((q) => q.map((it) => (it.id === nextItem.id && it.status === "retrying" ? { ...it, status: "pending", message: undefined } : it)));
          }, delaySec * 1000);
        } else {
          setUploadQueue((q) => q.map((it) => (it.id === nextItem.id ? { ...it, status: "error", errorKind: kind, message: label } : it)));
        }
      } finally {
        uploadProcessing.current = false;
      }
    })();
  }, [uploadQueue, connection.bucket]);

  // Bind: build the S3 client when the connection prop changes,
  // initial browse, prime usage. Cleanup unmounts the client.
  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    setConnectError(null);
    setBrowseResult(null);
    setUsage(null);
    setUploadQueue([]);
    const client = buildClient(connection);
    clientRef.current = client;
    (async () => {
      try {
        const result = await browse(client, connection.bucket, "");
        if (cancelled) return;
        setBrowseResult(result);
        void refreshUsage(client, connection.bucket);
      } catch (err) {
        if (!cancelled) setConnectError(classifyError(err));
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
      clientRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection.bucket, connection.accountId, connection.accessKeyId, connection.secretAccessKey]);

  // Refresh the library URL set whenever the connection changes — used
  // for the "In Library" badge.
  useEffect(() => {
    let cancelled = false;
    api
      .listVideos()
      .then((vs) => {
        if (cancelled) return;
        setLibraryByUrl(new Map(vs.map((v) => [canonicalUrl(v.url), v])));
      })
      .catch(() => {
        if (!cancelled) setLibraryByUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [connection.bucket]);

  // Collections — space-wide; feeds the folder-row "add to collection" picker.
  useEffect(() => {
    let cancelled = false;
    api
      .listCollections()
      .then((cs) => {
        if (!cancelled) setCollections(cs);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [connection.bucket]);

  const refreshUsage = async (client: S3Client, bucket: string) => {
    try {
      const u = await computeUsage(client, bucket);
      setUsage(u);
    } catch {
      setUsage(null);
    }
  };

  const navigate = async (prefix: string) => {
    const client = clientRef.current;
    if (!client) return;
    setBrowseLoading(true);
    try {
      const result = await browse(client, connection.bucket, prefix);
      setBrowseResult(result);
    } catch (err) {
      setConnectError(classifyError(err));
    } finally {
      setBrowseLoading(false);
    }
  };

  const refresh = useCallback(() => {
    if (browseResult) void navigate(browseResult.prefix);
    if (clientRef.current) void refreshUsage(clientRef.current, connection.bucket);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [browseResult?.prefix, connection.bucket]);

  // ── Mutations ────────────────────────────────────────────────────────

  const handleCreateFolder = async (name: string) => {
    const client = clientRef.current;
    if (!client || !browseResult) throw new Error("Not connected.");
    const prefix = browseResult.prefix + name;
    await createFolder(client, connection.bucket, prefix);
    refresh();
  };

  const handleDeleteFile = async (key: string) => {
    const client = clientRef.current;
    if (!client) throw new Error("Not connected.");
    const file = browseResult?.files.find((f) => f.key === key);
    markDeleting([key]);
    try {
      await deleteFile(client, connection.bucket, key);
      setUsage((u) => (u && file ? { bytes: Math.max(0, u.bytes - file.size), objects: Math.max(0, u.objects - 1) } : u));
      await new Promise((r) => setTimeout(r, ANIMATION_DELAY_MS));
      setBrowseResult((prev) => (prev ? { ...prev, files: prev.files.filter((f) => f.key !== key) } : prev));
    } catch (err) {
      setMutationError(classifyError(err).message);
      throw err;
    } finally {
      unmarkDeleting([key]);
    }
  };

  const handleDeleteFolder = async (prefix: string) => {
    const client = clientRef.current;
    if (!client) throw new Error("Not connected.");
    markDeleting([prefix]);
    try {
      const items = await listAllUnderPrefix(client, connection.bucket, prefix);
      const bytes = items.reduce((s, it) => s + it.size, 0);
      const keys = items.map((it) => it.key);
      await deleteMany(client, connection.bucket, keys);
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

  const handleBulkDelete = async (ids: string[]) => {
    const client = clientRef.current;
    if (!client || !browseResult) throw new Error("Not connected.");
    markDeleting(ids);
    try {
      const fileMap = new Map(browseResult.files.map((f) => [f.key, f] as const));
      const allItems: FileEntry[] = [];
      for (const id of ids) {
        if (id.endsWith("/")) {
          const sub = await listAllUnderPrefix(client, connection.bucket, id);
          allItems.push(...sub);
        } else {
          const file = fileMap.get(id);
          if (file) allItems.push(file);
        }
      }
      const bytes = allItems.reduce((s, it) => s + it.size, 0);
      const keys = allItems.map((it) => it.key);
      await deleteMany(client, connection.bucket, keys);
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
        // Best-effort follow-up — bucket op already succeeded.
      }
    },
    [libraryByUrl],
  );

  const handleRenameFile = async (oldKey: string, newName: string) => {
    const client = clientRef.current;
    if (!client || !browseResult) throw new Error("Not connected.");
    const prefix = browseResult.prefix;
    const newKey = prefix + newName;
    if (newKey === oldKey) return;
    if (browseResult.files.some((f) => f.key === newKey)) {
      setMutationError(`A file named "${newName}" already exists here.`);
      return;
    }
    try {
      await renameObject(client, connection.bucket, oldKey, newKey);
      const file = browseResult.files.find((f) => f.key === oldKey);
      setBrowseResult((prev) =>
        prev
          ? {
              ...prev,
              files: prev.files.map((f) => (f.key === oldKey ? { ...f, key: newKey } : f)).sort((a, b) => a.key.localeCompare(b.key)),
            }
          : prev,
      );
      if (connection.publicBaseUrl && file) {
        const oldUrl = `${connection.publicBaseUrl.replace(/\/$/, "")}/${oldKey}`;
        const newUrl = `${connection.publicBaseUrl.replace(/\/$/, "")}/${newKey}`;
        await updateLibraryUrlIfNeeded(oldUrl, newUrl);
      }
    } catch (err) {
      setMutationError(classifyError(err).message);
      throw err;
    }
  };

  const handleRenameFolder = async (oldPrefix: string, newName: string) => {
    const client = clientRef.current;
    if (!client || !browseResult) throw new Error("Not connected.");
    const parent = browseResult.prefix;
    const newPrefix = parent + newName + "/";
    if (newPrefix === oldPrefix) return;
    if (browseResult.folders.some((f) => f.prefix === newPrefix)) {
      setMutationError(`A folder named "${newName}" already exists here.`);
      return;
    }
    try {
      const { oldKeys, newKeys } = await renamePrefix(client, connection.bucket, oldPrefix, newPrefix);
      setBrowseResult((prev) =>
        prev
          ? {
              ...prev,
              folders: prev.folders.map((f) => (f.prefix === oldPrefix ? { prefix: newPrefix } : f)).sort((a, b) => a.prefix.localeCompare(b.prefix)),
            }
          : prev,
      );
      if (connection.publicBaseUrl) {
        const base = connection.publicBaseUrl.replace(/\/$/, "");
        for (let i = 0; i < oldKeys.length; i++) {
          await updateLibraryUrlIfNeeded(`${base}/${oldKeys[i]}`, `${base}/${newKeys[i]}`);
        }
      }
    } catch (err) {
      setMutationError(classifyError(err).message);
      throw err;
    }
  };

  const handleAddToLibrary = useCallback(async (url: string) => {
    const created = await api.createVideo({ url });
    setLibraryByUrl((prev) => {
      const next = new Map(prev ?? []);
      next.set(canonicalUrl(created.url), created);
      return next;
    });
  }, []);

  // Resolve a collection target to its items: a folder contributes every
  // media file under it; a single file contributes just itself. Public
  // URLs come from the connection's base URL, so the collection is
  // viewable without bucket credentials.
  const collectTargetItems = useCallback(
    async (target: CollectionTarget): Promise<CollectionItem[]> => {
      const base = connection.publicBaseUrl;
      if (!base) throw new Error("Set a public base URL on this connection first.");
      if (target.kind === "file") {
        if (!isMediaUrl(target.key)) throw new Error("That file isn't a playable media file.");
        return [{ url: publicUrlForKey(base, target.key), name: target.key.split("/").pop() || target.key }];
      }
      const client = clientRef.current;
      if (!client) throw new Error("Not connected.");
      const entries = await listAllUnderPrefix(client, connection.bucket, target.prefix);
      const media = entries.filter((e) => isMediaUrl(e.key)).sort((a, b) => a.key.localeCompare(b.key));
      if (media.length === 0) throw new Error("This folder has no media files.");
      return media.map((e) => ({ url: publicUrlForKey(base, e.key), name: e.key.slice(target.prefix.length) }));
    },
    [connection.bucket, connection.publicBaseUrl],
  );

  const handleNewCollection = useCallback(
    async (target: CollectionTarget) => {
      const items = await collectTargetItems(target);
      const title =
        target.kind === "folder" ? target.prefix.split("/").filter(Boolean).pop() || "Collection" : (target.key.split("/").pop() || "Collection").replace(/\.[^.]+$/, "");
      const created = await api.createCollection({ title, items });
      setCollections((prev) => [created, ...prev]);
      toast.success(`Collection "${created.title}" created — ${items.length} item${items.length === 1 ? "" : "s"}.`);
    },
    [collectTargetItems, toast],
  );

  const handleAddToCollection = useCallback(
    async (target: CollectionTarget, collectionId: string) => {
      const newItems = await collectTargetItems(target);
      const existing = await api.getCollection(collectionId);
      const haveUrls = new Set(existing.items.map((it) => it.url));
      const merged = [...existing.items, ...newItems.filter((it) => !haveUrls.has(it.url))];
      const updated = await api.updateCollection(collectionId, { items: merged });
      setCollections((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      const added = merged.length - existing.items.length;
      toast.success(added === 0 ? `Already in "${updated.title}".` : `Added ${added} item${added === 1 ? "" : "s"} to "${updated.title}".`);
    },
    [collectTargetItems, toast],
  );

  const handleOpenLibraryEntry = useCallback(
    (publicUrl: string) => {
      const video = libraryByUrl?.get(canonicalUrl(publicUrl));
      if (video) setEditingVideo(video);
    },
    [libraryByUrl],
  );

  const handleUpdateVideo = useCallback(async (id: string, patch: { title?: string; subtitles?: Subtitle[] }) => {
    const updated = await api.updateVideo(id, patch);
    setLibraryByUrl((prev) => {
      const next = new Map(prev ?? []);
      next.set(canonicalUrl(updated.url), updated);
      return next;
    });
    setEditingVideo(updated);
  }, []);

  const matchEnabled = useMemo(() => Boolean(connection.publicBaseUrl), [connection.publicBaseUrl]);

  // Canonical URLs already present in some collection — feeds the file
  // browser's "in a collection" indicator, mirroring the library badge.
  const collectionUrls = useMemo(() => {
    const set = new Set<string>();
    for (const c of collections) for (const it of c.items) set.add(canonicalUrl(it.url));
    return set;
  }, [collections]);

  if (busy) {
    return (
      <div className="flex min-h-[12rem] flex-col items-center justify-center gap-3 border border-border bg-bg-elevated/40 text-center text-xs text-text-dim">
        Connecting to {connection.bucket}…
      </div>
    );
  }
  if (connectError) {
    return (
      <div className="flex flex-col gap-2 border border-accent/30 bg-accent/10 p-3 text-xs text-accent">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="text-foreground/85">{connectError.message}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
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
        libraryByUrl={matchEnabled ? (libraryByUrl ?? undefined) : undefined}
        collectionUrls={matchEnabled ? collectionUrls : undefined}
        onAddToLibrary={matchEnabled ? handleAddToLibrary : undefined}
        onOpenLibraryEntry={matchEnabled ? handleOpenLibraryEntry : undefined}
        collections={collections}
        onNewCollection={matchEnabled ? handleNewCollection : undefined}
        onAddToCollection={matchEnabled ? handleAddToCollection : undefined}
      />
      <UploadQueuePanel queue={uploadQueue} onClearDone={clearDoneFromQueue} onRemove={removeFromQueue} onRetry={retryFromQueue} />
      {editingVideo && <EditVideoDialog open video={editingVideo} onClose={() => setEditingVideo(null)} onUpdate={handleUpdateVideo} />}
    </div>
  );
}

function randomQueueId(): string {
  return Math.random().toString(36).slice(2, 10);
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
