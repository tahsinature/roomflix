import { useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronRight,
  File as FileIcon,
  FileUp,
  Folder,
  FolderOpen,
  FolderPlus,
  Layers,
  Library as LibraryIcon,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CopyButton } from "@/components/CopyButton";
import { Modal } from "@/components/Modal";
import { urlIsClearlyNotMedia } from "@/lib/play";
import { canonicalUrl, cn, formatBytes, isMediaUrl } from "@/lib/utils";
import type { BrowseResult } from "@/lib/buckets/types";
import type { Collection, Video } from "@shared/protocol";

export function publicUrlForKey(base: string, key: string): string {
  const b = base.endsWith("/") ? base.slice(0, -1) : base;
  return `${b}/${key}`;
}

// What a collection action targets — a whole folder (all its media) or a
// single file. The storage page resolves each to collection items.
export type CollectionTarget = { kind: "folder"; prefix: string } | { kind: "file"; key: string };

// File browser with selection, per-row delete, inline new-folder, and a
// bulk-action bar that appears when anything is selected. The page above
// owns the actual mutations — this component just emits requests.
export function FileBrowser({
  result,
  loading,
  onNavigate,
  onRefresh,
  onCreateFolder,
  onDeleteFile,
  onDeleteFolder,
  onBulkDelete,
  onRenameFile,
  onRenameFolder,
  deletingIds,
  headroom,
  onAcceptFiles,
  publicBaseUrl,
  libraryByUrl,
  collectionUrls,
  onAddToLibrary,
  onOpenLibraryEntry,
  collections,
  onNewCollection,
  onAddToCollection,
}: {
  result: BrowseResult | null;
  loading: boolean;
  onNavigate: (prefix: string) => void;
  onRefresh: () => void;
  onCreateFolder: (name: string) => Promise<void>;
  onDeleteFile: (key: string) => Promise<void>;
  onDeleteFolder: (prefix: string) => Promise<void>;
  onBulkDelete: (ids: string[]) => Promise<void>;
  // Inline rename. Receives the new bare name (no slashes), parent provides
  // the full-key/prefix construction + the S3 copy-then-delete dance.
  onRenameFile: (oldKey: string, newName: string) => Promise<void>;
  onRenameFolder: (oldPrefix: string, newName: string) => Promise<void>;
  // IDs (file keys / folder prefixes) currently mid-delete. Affected rows
  // collapse + show a spinner. Drives both single-row trash and bulk delete.
  deletingIds: Set<string>;
  // Upload: drop anywhere on the browser or click the Upload button. The
  // parent owns the queue + processing; we just hand off the accepted files
  // and show drop affordances. `headroom` is the current upload budget,
  // displayed in the drag overlay so users know what fits.
  headroom: number;
  onAcceptFiles: (files: FileList | File[]) => void;
  // Library integration: when `libraryByUrl` is set, file rows render an
  // "In library" button (opens the entry's edit modal via onOpenLibraryEntry)
  // for matching URLs and a "+ Library" button (via onAddToLibrary) for media
  // files that aren't yet in the library.
  publicBaseUrl?: string;
  libraryByUrl?: Map<string, Video>;
  // Canonical URLs that already appear in at least one collection — drives
  // the "in a collection" indicator on file rows.
  collectionUrls?: Set<string>;
  onAddToLibrary?: (url: string) => Promise<void>;
  onOpenLibraryEntry?: (publicUrl: string) => void;
  // When set, folder and file rows show a "collection" action — start a
  // new collection or add into an existing one. `collections` feeds the
  // picker; a folder contributes all its media, a file just itself.
  collections?: Collection[];
  onNewCollection?: (target: CollectionTarget) => Promise<void>;
  onAddToCollection?: (target: CollectionTarget, collectionId: string) => Promise<void>;
}) {
  // Selection IDs: file keys for files, prefix-with-trailing-slash for folders.
  // A Set keeps toggling O(1) and the union of files+folders fits naturally.
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [lastClickedIndex, setLastClickedIndex] = useState<number | null>(null);
  // Target (folder or file) a collection action is being chosen for.
  const [collectionTarget, setCollectionTarget] = useState<CollectionTarget | null>(null);

  // Clear selection when the user navigates or when the listing reloads to
  // anything substantially different — keeps stale IDs out of bulk operations.
  useEffect(() => {
    setSelection(new Set());
    setLastClickedIndex(null);
  }, [result?.prefix]);

  // Reconcile selection against the current listing whenever it changes —
  // drops anything that was deleted out from under us by another path.
  useEffect(() => {
    if (!result) return;
    const valid = new Set<string>();
    for (const f of result.files) valid.add(f.key);
    for (const f of result.folders) valid.add(f.prefix);
    setSelection((prev) => {
      const next = new Set<string>();
      for (const id of prev) if (valid.has(id)) next.add(id);
      return next.size === prev.size ? prev : next;
    });
  }, [result]);

  const flatItems: { id: string; type: "folder" | "file" }[] = result
    ? [...result.folders.map((f) => ({ id: f.prefix, type: "folder" as const })), ...result.files.map((f) => ({ id: f.key, type: "file" as const }))]
    : [];

  const toggleSelection = (index: number, shiftKey: boolean) => {
    const id = flatItems[index].id;
    if (shiftKey && lastClickedIndex !== null) {
      const [start, end] = [Math.min(lastClickedIndex, index), Math.max(lastClickedIndex, index)];
      setSelection((prev) => {
        const next = new Set(prev);
        for (let i = start; i <= end; i++) next.add(flatItems[i].id);
        return next;
      });
    } else {
      setSelection((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    }
    setLastClickedIndex(index);
  };

  const allSelected = flatItems.length > 0 && flatItems.every((it) => selection.has(it.id));
  const toggleSelectAll = () => {
    if (allSelected) {
      setSelection(new Set());
    } else {
      setSelection(new Set(flatItems.map((it) => it.id)));
    }
    setLastClickedIndex(null);
  };

  // ── Drag-and-drop overlay ────────────────────────────────────────────
  const [dragOver, setDragOver] = useState(false);
  const dragCounter = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const currentPrefix = result?.prefix ?? "";

  // Drag-counter trick: dragenter/leave bubble through children, so a naive
  // boolean toggles repeatedly. Counting net enters lets us flip the overlay
  // only on the outermost transitions. Filtered to file drags only so text
  // selections don't trigger the overlay.
  const onDragEnter = (e: React.DragEvent) => {
    if (!e.dataTransfer?.types.includes("Files")) return;
    e.preventDefault();
    dragCounter.current++;
    if (dragCounter.current === 1) setDragOver(true);
  };
  const onDragLeave = (e: React.DragEvent) => {
    if (!e.dataTransfer?.types.includes("Files")) return;
    e.preventDefault();
    dragCounter.current--;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setDragOver(false);
    }
  };
  const onDragOver = (e: React.DragEvent) => {
    if (!e.dataTransfer?.types.includes("Files")) return;
    e.preventDefault();
  };
  const onDrop = (e: React.DragEvent) => {
    if (!e.dataTransfer?.types.includes("Files")) return;
    e.preventDefault();
    dragCounter.current = 0;
    setDragOver(false);
    onAcceptFiles(e.dataTransfer.files);
  };

  return (
    <section className="relative border border-border bg-bg-elevated/40" onDragEnter={onDragEnter} onDragLeave={onDragLeave} onDragOver={onDragOver} onDrop={onDrop}>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <Breadcrumb prefix={result?.prefix ?? ""} onNavigate={onNavigate} />
        <div className="flex items-center gap-1">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              const f = e.target.files;
              e.target.value = "";
              if (f) onAcceptFiles(f);
            }}
          />
          <Button variant="ghost" size="sm" onClick={() => fileInputRef.current?.click()} aria-label="Upload files" title="Upload files">
            <Upload className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Upload</span>
          </Button>
          <NewFolderButton onCreate={onCreateFolder} />
          <Button variant="ghost" size="sm" onClick={onRefresh} disabled={loading} aria-label="Refresh listing">
            <RefreshCw className={loading ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
          </Button>
        </div>
      </header>

      {loading && !result ? (
        <div className="flex items-center gap-2 px-4 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading…
        </div>
      ) : !result || flatItems.length === 0 ? (
        <div className="px-4 py-10 text-center text-xs text-text-dim">This folder is empty.</div>
      ) : (
        <>
          {/* Show whenever the folder has at least one item, even just a
              single row — keeps the layout stable and the "Select all"
              affordance consistent (avoids the flick where clicking a
              checkbox suddenly inserts the bar above the row). */}
          {flatItems.length > 0 && (
            <SelectionBar
              count={selection.size}
              allSelected={allSelected}
              onToggleAll={toggleSelectAll}
              onClear={() => {
                setSelection(new Set());
                setLastClickedIndex(null);
              }}
              onDelete={async () => {
                await onBulkDelete([...selection]);
                setSelection(new Set());
                setLastClickedIndex(null);
              }}
            />
          )}
          <ul>
            {result.folders.map((f, i) => (
              <FolderRow
                key={f.prefix}
                prefix={f.prefix}
                parent={result.prefix}
                index={i}
                selected={selection.has(f.prefix)}
                deleting={deletingIds.has(f.prefix)}
                onOpen={() => onNavigate(f.prefix)}
                onToggleSelect={(e) => toggleSelection(i, e.shiftKey)}
                onDelete={() => onDeleteFolder(f.prefix)}
                onRename={(newName) => onRenameFolder(f.prefix, newName)}
                onCollectionAction={onNewCollection ? () => setCollectionTarget({ kind: "folder", prefix: f.prefix }) : undefined}
              />
            ))}
            {result.files.map((f, i) => {
              const url = publicBaseUrl ? publicUrlForKey(publicBaseUrl, f.key) : null;
              // Match in canonical form so percent-encoded vs literal chars
              // (e.g. spaces vs %20) don't trip up the library lookup.
              const inLibrary = url !== null && libraryByUrl?.has(canonicalUrl(url)) === true;
              const inCollection = url !== null && collectionUrls?.has(canonicalUrl(url)) === true;
              // Reuse the same media-extension whitelist that PlayButton +
              // LibraryPicker use to gate Play. If the file isn't playable
              // media, the "+ Library" button doesn't apply — hide it.
              const isMedia = !urlIsClearlyNotMedia(f.key);
              return (
                <FileRow
                  key={f.key}
                  fullKey={f.key}
                  parent={result.prefix}
                  size={f.size}
                  lastModified={f.lastModified}
                  index={result.folders.length + i}
                  selected={selection.has(f.key)}
                  deleting={deletingIds.has(f.key)}
                  onToggleSelect={(e) => toggleSelection(result.folders.length + i, e.shiftKey)}
                  onDelete={() => onDeleteFile(f.key)}
                  onRename={(newName) => onRenameFile(f.key, newName)}
                  publicUrl={url}
                  inLibrary={inLibrary}
                  inCollection={inCollection}
                  onAddToLibrary={isMedia ? onAddToLibrary : undefined}
                  onOpenLibraryEntry={onOpenLibraryEntry}
                  onCollectionAction={isMediaUrl(f.key) && onNewCollection ? () => setCollectionTarget({ kind: "file", key: f.key }) : undefined}
                />
              );
            })}
          </ul>
        </>
      )}

      {result?.truncated && (
        <div className="border-t border-border px-4 py-2.5 text-[11px] text-amber-300/80">
          More than 1000 items at this prefix — only the first page is shown. Paging arrives in a later update.
        </div>
      )}

      {dragOver && (
        <div className="pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-center gap-2 border-2 border-dashed border-accent bg-accent/[0.06] backdrop-blur-[1px]">
          <FileUp className="h-8 w-8 text-accent" />
          <div className="font-mono text-sm text-foreground">Drop to upload</div>
          <div className="font-mono text-[11px] text-muted-foreground">
            to <span className="text-foreground/80">/{currentPrefix}</span> · {formatBytes(headroom)} of headroom
          </div>
        </div>
      )}

      {collectionTarget !== null && onNewCollection && onAddToCollection && (
        <CollectionTargetModal
          target={collectionTarget}
          parent={result?.prefix ?? ""}
          collections={collections ?? []}
          onNewCollection={onNewCollection}
          onAddToCollection={onAddToCollection}
          onClose={() => setCollectionTarget(null)}
        />
      )}
    </section>
  );
}

// Modal for the "add to collection" action on a folder or file row. A
// modal (rather than an inline dropdown) sidesteps the row's overflow
// clipping and works the same on touch.
function CollectionTargetModal({
  target,
  parent,
  collections,
  onNewCollection,
  onAddToCollection,
  onClose,
}: {
  target: CollectionTarget;
  parent: string;
  collections: Collection[];
  onNewCollection: (target: CollectionTarget) => Promise<void>;
  onAddToCollection: (target: CollectionTarget, collectionId: string) => Promise<void>;
  onClose: () => void;
}) {
  const label = target.kind === "folder" ? target.prefix.slice(parent.length, target.prefix.length - 1) || target.prefix : target.key.slice(parent.length) || target.key;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await fn();
      onClose();
    } catch (e) {
      setError((e as Error).message || "Something went wrong.");
      setBusy(false);
    }
  };

  return (
    <Modal open title={`Add “${label}” to a collection`} onClose={busy ? () => {} : onClose} className="max-w-md">
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">
          {target.kind === "folder" ? "Includes every video, audio, and image file in the folder." : "Adds this file as a single collection item."}
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={() => run(() => onNewCollection(target))}
          className="flex w-full items-center gap-2 border border-accent/40 bg-accent/10 px-3 py-2.5 text-left text-sm text-foreground transition hover:bg-accent/15 disabled:opacity-50"
        >
          <Plus className="h-4 w-4 shrink-0 text-accent" />
          {target.kind === "folder" ? "New collection from this folder" : "New collection with this file"}
        </button>
        {collections.length > 0 && (
          <div>
            <div className="section-label muted mb-1.5">Or add into an existing collection</div>
            <ul className="max-h-60 overflow-y-auto border border-border">
              {collections.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => run(() => onAddToCollection(target, c.id))}
                    className="flex w-full items-center justify-between gap-3 border-b border-border px-3 py-2 text-left text-sm text-foreground transition last:border-b-0 hover:bg-white/[0.04] disabled:opacity-50"
                  >
                    <span className="truncate">{c.title}</span>
                    <span className="shrink-0 font-mono text-[10px] text-text-dim">{c.items.length}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {error && <div className="border border-accent/40 bg-accent/10 px-3 py-2 text-xs text-foreground">{error}</div>}
        {busy && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Working…
          </div>
        )}
      </div>
    </Modal>
  );
}

function Breadcrumb({ prefix, onNavigate }: { prefix: string; onNavigate: (prefix: string) => void }) {
  const segments = prefix.split("/").filter(Boolean);
  return (
    <nav className="flex min-w-0 items-center gap-1 overflow-hidden text-xs">
      <button
        type="button"
        onClick={() => onNavigate("")}
        className="flex items-center gap-1.5 px-1.5 py-1 text-muted-foreground transition hover:bg-white/[0.04] hover:text-foreground"
      >
        <FolderOpen className="h-3.5 w-3.5" />
        <span className="font-mono">/</span>
      </button>
      {segments.map((seg, i) => {
        const target = segments.slice(0, i + 1).join("/") + "/";
        const isLast = i === segments.length - 1;
        return (
          <span key={target} className="flex items-center gap-1">
            <ChevronRight className="h-3 w-3 text-text-dim" />
            <button
              type="button"
              onClick={() => onNavigate(target)}
              className={
                isLast
                  ? "truncate px-1.5 py-1 font-mono text-foreground"
                  : "truncate px-1.5 py-1 font-mono text-muted-foreground transition hover:bg-white/[0.04] hover:text-foreground"
              }
            >
              {seg}
            </button>
          </span>
        );
      })}
    </nav>
  );
}

function NewFolderButton({ onCreate }: { onCreate: (name: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    if (trimmed.includes("/")) {
      setErr("Folder names can't contain slashes.");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      await onCreate(trimmed);
      setName("");
      setOpen(false);
    } catch (e) {
      setErr((e as Error).message || "Failed to create folder.");
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)} aria-label="New folder" title="New folder">
        <FolderPlus className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">New folder</span>
      </Button>
    );
  }

  return (
    <form onSubmit={submit} className="flex items-center gap-1">
      <Input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="folder-name"
        className="h-8 w-44 text-xs"
        disabled={busy}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
      />
      <Button type="submit" variant="accent" size="sm" disabled={!name.trim() || busy}>
        {busy ? "…" : "Create"}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => {
          setOpen(false);
          setName("");
          setErr("");
        }}
        disabled={busy}
      >
        Cancel
      </Button>
      {err && <span className="ml-2 text-[11px] text-accent">{err}</span>}
    </form>
  );
}

// Combined select-all bar + bulk-action bar. Lives in the same DOM slot
// regardless of selection state — colors and content change in place so a
// row click doesn't shift the file list down by a row.
function SelectionBar({
  count,
  allSelected,
  onToggleAll,
  onClear,
  onDelete,
}: {
  count: number;
  allSelected: boolean;
  onToggleAll: () => void;
  onClear: () => void;
  onDelete: () => Promise<void>;
}) {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const isSelecting = count > 0;

  // Disarm after 3s — matches the per-row pattern.
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);

  // Selection emptied externally (e.g. Clear, or all selected items deleted) →
  // reset the armed/busy local state so reopening the panel starts clean.
  useEffect(() => {
    if (!isSelecting) {
      setArmed(false);
      setBusy(false);
    }
  }, [isSelecting]);

  const trigger = async () => {
    if (busy) return;
    if (!armed) {
      setArmed(true);
      return;
    }
    setArmed(false);
    setBusy(true);
    try {
      await onDelete();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={cn(
        // Fixed height matches the selected-state row (sm buttons are h-8 +
        // 2 × py-2.5 ≈ 52px). Reserving it in both states keeps the file
        // rows below from shifting when selection toggles.
        "flex h-[3.25rem] items-center justify-between gap-3 border-b px-4 text-xs transition-colors",
        isSelecting ? "border-accent/30 bg-accent/[0.07]" : "border-border bg-white/[0.015]",
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <Checkbox checked={allSelected} onChange={onToggleAll} aria-label={isSelecting ? "Toggle selection of all rows" : "Select all in this folder"} />
        {isSelecting ? <span className="font-medium text-accent">{count} selected</span> : <span className="text-[11px] text-text-dim">Select all in this folder</span>}
      </div>
      {isSelecting && (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={onClear} disabled={busy}>
            <X className="h-3.5 w-3.5" />
            Clear
          </Button>
          <Button variant="destructive" size="sm" onClick={trigger} disabled={busy} className={cn(armed && "animate-pulse-soft")}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            {busy ? "Deleting…" : armed ? "Click again" : "Delete"}
          </Button>
        </div>
      )}
    </div>
  );
}

function FolderRow({
  prefix,
  parent,
  index: _index,
  selected,
  deleting,
  onOpen,
  onToggleSelect,
  onDelete,
  onRename,
  onCollectionAction,
}: {
  prefix: string;
  parent: string;
  index: number;
  selected: boolean;
  deleting: boolean;
  onOpen: () => void;
  onToggleSelect: (e: React.MouseEvent) => void;
  onDelete: () => Promise<void>;
  onRename: (newName: string) => Promise<void>;
  onCollectionAction?: () => void;
}) {
  const name = prefix.slice(parent.length, prefix.length - 1);
  const [armed, setArmed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [renaming, setRenaming] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);

  const trigger = async () => {
    if (deleting) return;
    if (!armed) {
      setArmed(true);
      return;
    }
    setArmed(false);
    try {
      await onDelete();
    } catch {
      /* parent surfaces the error */
    }
  };

  const commitRename = async (newName: string) => {
    if (newName === name) {
      setEditing(false);
      return;
    }
    setRenaming(true);
    try {
      await onRename(newName);
    } catch {
      /* parent surfaces the error in its banner */
    } finally {
      // Always exit edit mode — on success the row re-renders with the new
      // name, on failure the error banner above explains and the user can
      // hit the pencil again to retry.
      setRenaming(false);
      setEditing(false);
    }
  };

  return (
    <li
      className={cn(
        "flex items-center gap-3 border-b border-border overflow-hidden transition-all duration-300 ease-in-out",
        selected && !deleting ? "bg-accent/[0.06]" : !deleting && "hover:bg-white/[0.02]",
        deleting ? "max-h-0 opacity-0 border-b-transparent" : "max-h-[120px] last:border-b-0",
      )}
    >
      <div className="pl-4">
        <Checkbox checked={selected} onChange={onToggleSelect} aria-label={`Select folder ${name}`} />
      </div>
      {editing ? (
        <div className="flex min-w-0 flex-1 items-center gap-3 py-3">
          <Folder className="h-4 w-4 shrink-0 text-cyan/80" />
          <RenameInput initial={name} busy={renaming} onSubmit={commitRename} onCancel={() => setEditing(false)} />
        </div>
      ) : (
        <button
          type="button"
          onClick={onOpen}
          onDoubleClick={(e) => {
            e.stopPropagation();
            setEditing(true);
          }}
          disabled={deleting}
          className="flex min-w-0 flex-1 items-center gap-3 py-3 text-left disabled:cursor-not-allowed"
        >
          <Folder className="h-4 w-4 shrink-0 text-cyan/80" />
          <span className="min-w-0 flex-1 truncate text-sm text-foreground">{name || prefix}</span>
          <span className="shrink-0 font-mono text-[11px] text-text-dim">folder</span>
        </button>
      )}
      {onCollectionAction && !editing && (
        <button
          type="button"
          onClick={onCollectionAction}
          disabled={deleting}
          aria-label={`Add folder ${name} to a collection`}
          title="Add this folder to a collection"
          className="shrink-0 p-1.5 text-muted-foreground transition hover:bg-white/[0.05] hover:text-foreground disabled:opacity-50"
        >
          <Layers className="h-3.5 w-3.5" />
        </button>
      )}
      {!editing && (
        <button
          type="button"
          onClick={() => setEditing(true)}
          disabled={deleting}
          aria-label={`Rename folder ${name}`}
          title="Rename"
          className="shrink-0 p-1.5 text-muted-foreground transition hover:bg-white/[0.05] hover:text-foreground disabled:opacity-50"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      )}
      <button
        type="button"
        onClick={trigger}
        disabled={deleting || editing}
        aria-label={armed ? "Click again to confirm delete" : `Delete folder ${name}`}
        title={deleting ? "Deleting…" : armed ? "Click again to confirm" : "Delete folder"}
        className={cn(
          "mr-3 shrink-0 p-1.5 transition",
          deleting ? "text-muted-foreground" : armed ? "animate-pulse-soft bg-accent text-white" : "text-muted-foreground hover:bg-white/[0.05] hover:text-accent",
        )}
      >
        {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
      </button>
    </li>
  );
}

function FileRow({
  fullKey,
  parent,
  size,
  lastModified,
  index: _index,
  selected,
  deleting,
  onToggleSelect,
  onDelete,
  onRename,
  publicUrl,
  inLibrary,
  inCollection,
  onAddToLibrary,
  onOpenLibraryEntry,
  onCollectionAction,
}: {
  fullKey: string;
  parent: string;
  size: number;
  lastModified?: Date;
  index: number;
  selected: boolean;
  deleting: boolean;
  onToggleSelect: (e: React.MouseEvent) => void;
  onDelete: () => Promise<void>;
  onRename: (newName: string) => Promise<void>;
  publicUrl: string | null;
  inLibrary: boolean;
  inCollection: boolean;
  onAddToLibrary?: (url: string) => Promise<void>;
  onOpenLibraryEntry?: (publicUrl: string) => void;
  onCollectionAction?: () => void;
}) {
  const name = fullKey.slice(parent.length);
  const [armed, setArmed] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");
  const [editing, setEditing] = useState(false);
  const [renaming, setRenaming] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);

  const trigger = async () => {
    if (deleting) return;
    if (!armed) {
      setArmed(true);
      return;
    }
    setArmed(false);
    try {
      await onDelete();
    } catch {
      /* parent surfaces the error */
    }
  };

  const addToLibrary = async () => {
    if (!publicUrl || !onAddToLibrary || adding) return;
    setAdding(true);
    setAddError("");
    try {
      await onAddToLibrary(publicUrl);
    } catch (err) {
      setAddError((err as Error).message || "Failed");
    } finally {
      setAdding(false);
    }
  };

  const commitRename = async (newName: string) => {
    if (newName === name) {
      setEditing(false);
      return;
    }
    setRenaming(true);
    try {
      await onRename(newName);
    } catch {
      /* parent surfaces the error in its banner */
    } finally {
      // Always exit edit mode — on success the row re-renders with the new
      // name, on failure the error banner above explains and the user can
      // hit the pencil again to retry.
      setRenaming(false);
      setEditing(false);
    }
  };

  // Library / collection chips, grouped so they wrap as one cluster.
  // Library + collection affordances as compact icon buttons — the same
  // weight as rename/copy/delete, so the row reads as one even toolbar
  // rather than two prominent labelled pills. A green check = already in
  // the library (click to edit); a library glyph = add it; a layers glyph
  // = add to a collection.
  const chips = publicUrl && (inLibrary || onAddToLibrary || onCollectionAction) && (
    <div className="flex shrink-0 items-center">
      {inLibrary && (
        <button
          type="button"
          onClick={onOpenLibraryEntry ? () => onOpenLibraryEntry(publicUrl) : undefined}
          disabled={!onOpenLibraryEntry}
          aria-label="In your library"
          title={onOpenLibraryEntry ? "In your library — edit entry" : "In your library"}
          className="p-1.5 text-live transition hover:bg-white/[0.05] disabled:cursor-default"
        >
          <Check className="h-3.5 w-3.5" />
        </button>
      )}
      {!inLibrary && onAddToLibrary && (
        <button
          type="button"
          onClick={addToLibrary}
          disabled={adding}
          aria-label="Add to library"
          title={addError || "Add to library"}
          className="p-1.5 text-muted-foreground transition hover:bg-white/[0.05] hover:text-foreground disabled:opacity-50"
        >
          {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : addError ? <X className="h-3.5 w-3.5 text-accent" /> : <LibraryIcon className="h-3.5 w-3.5" />}
        </button>
      )}
      {onCollectionAction && (
        <button
          type="button"
          onClick={onCollectionAction}
          aria-label="Add to a collection"
          title={inCollection ? "In a collection — add to another" : "Add to a collection"}
          className={cn("p-1.5 transition hover:bg-white/[0.05]", inCollection ? "text-cyan" : "text-muted-foreground hover:text-foreground")}
        >
          <Layers className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );

  return (
    <li
      className={cn(
        "flex items-center gap-3 border-b border-border overflow-hidden transition-all duration-300 ease-in-out",
        selected && !deleting ? "bg-accent/[0.06]" : !deleting && "hover:bg-white/[0.02]",
        deleting ? "max-h-0 opacity-0 border-b-transparent" : "max-h-[160px] last:border-b-0",
      )}
    >
      <div className="shrink-0 pl-4">
        <Checkbox checked={selected} onChange={onToggleSelect} aria-label={`Select ${name}`} />
      </div>
      {/* Wrapping content: the name keeps a readable minimum width; the
          chips + meta + row actions wrap onto a second line when the
          window is too narrow to fit everything beside it. */}
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5 pr-3">
        <div className="flex min-w-[12rem] flex-1 items-center gap-2">
          <FileIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
          {editing ? (
            <RenameInput initial={name} busy={renaming} onSubmit={commitRename} onCancel={() => setEditing(false)} />
          ) : (
            <span onDoubleClick={() => setEditing(true)} className="min-w-0 flex-1 truncate text-sm text-foreground" title={fullKey}>
              {name}
            </span>
          )}
        </div>

        {chips}

        <div className="ml-auto flex shrink-0 items-center gap-1">
          <span className="mr-1 font-mono text-[11px] tabular-nums text-text-dim">{formatBytes(size)}</span>
          {lastModified && <span className="mr-1 hidden font-mono text-[11px] text-text-dim sm:inline">{lastModified.toISOString().slice(0, 10)}</span>}
          {!editing && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              disabled={deleting}
              aria-label={`Rename ${name}`}
              title="Rename"
              className="p-1.5 text-muted-foreground transition hover:bg-white/[0.05] hover:text-foreground disabled:opacity-50"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
          {publicUrl && <CopyButton text={publicUrl} label="public link" />}
          <button
            type="button"
            onClick={trigger}
            disabled={deleting || editing}
            aria-label={armed ? "Click again to confirm delete" : `Delete ${name}`}
            title={deleting ? "Deleting…" : armed ? "Click again to confirm" : "Delete"}
            className={cn(
              "p-1.5 transition",
              deleting ? "text-muted-foreground" : armed ? "animate-pulse-soft bg-accent text-white" : "text-muted-foreground hover:bg-white/[0.05] hover:text-accent",
            )}
          >
            {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </li>
  );
}

// Inline rename input — replaces the filename span/button while in edit
// mode. Auto-focuses on mount and selects the stem (everything before the
// last dot) so typing replaces the name without nuking the extension.
// Enter saves, Esc cancels, blur cancels (safer than blur-saves on
// accidental focus loss). Slashes in the input are rejected since they'd
// create unintended subfolders.
function RenameInput({ initial, busy, onSubmit, onCancel }: { initial: string; busy: boolean; onSubmit: (next: string) => void; onCancel: () => void }) {
  const [value, setValue] = useState(initial);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    const lastDot = initial.lastIndexOf(".");
    if (lastDot > 0) el.setSelectionRange(0, lastDot);
    else el.select();
  }, [initial]);

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed || trimmed.includes("/") || busy) return;
    onSubmit(trimmed);
  };

  return (
    <div className="relative flex min-w-0 flex-1 items-center">
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          else if (e.key === "Escape") onCancel();
        }}
        onBlur={() => {
          if (!busy) onCancel();
        }}
        disabled={busy}
        className={cn(
          "min-w-0 flex-1 border bg-input/80 px-2 py-1 font-mono text-sm text-foreground focus:outline-none",
          busy ? "border-cyan/60 pr-7 text-foreground/60" : "border-accent/60",
        )}
        aria-label="New name"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
      />
      {busy && (
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-cyan" aria-live="polite">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        </span>
      )}
    </div>
  );
}

// Visible-when-helpful banner that links the public base URL to the badge
// feature. Storage renders this above the browser when the connection's
// publicBaseUrl is missing — saves the user from wondering why no badges appear.
export function LibraryHintBanner() {
  return (
    <div className="border border-border bg-white/[0.02] px-4 py-2.5 text-[11px] text-muted-foreground">
      <span className="inline-flex items-center gap-2">
        <LibraryIcon className="h-3 w-3 text-accent" />
        Set a Public base URL on this connection to see which files are already in your Library.
      </span>
    </div>
  );
}

// Sharp-cornered checkbox matching the brutalist 0-radius theme. Keep the
// styling co-located so we don't have to add another shared primitive.
function Checkbox({ checked, onChange, ...rest }: { checked: boolean; onChange: (e: React.MouseEvent) => void } & React.AriaAttributes) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={onChange}
      className={cn(
        "flex h-4 w-4 shrink-0 items-center justify-center border transition-colors",
        checked ? "border-accent bg-accent" : "border-border bg-input/40 hover:border-border-hover",
      )}
      {...rest}
    >
      {checked && (
        <svg viewBox="0 0 12 12" className="h-3 w-3 fill-none stroke-white" strokeWidth="2.5" strokeLinecap="square" strokeLinejoin="miter">
          <polyline points="2,7 5,10 10,3" />
        </svg>
      )}
    </button>
  );
}
