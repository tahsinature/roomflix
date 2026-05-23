import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowLeft, Film, Layers, Loader2, Music, Plus, Trash2 } from "lucide-react";
import type { Collection, CollectionItem } from "@shared/protocol";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, ApiError } from "@/lib/api";
import { useToast } from "@/components/Toast";
import { cn, mediaKind, urlFilename } from "@/lib/utils";

// Full-page collection editor — built for collections with hundreds of
// items, which the old modal couldn't handle. Items render as a sortable
// grid (drag to reorder); the title and add-by-URL live in a sticky bar so
// they stay reachable however far you've scrolled.
export default function CollectionEdit() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [original, setOriginal] = useState<Collection | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  // Working copy — saved in one PATCH.
  const [title, setTitle] = useState("");
  const [items, setItems] = useState<CollectionItem[]>([]);
  const [addUrl, setAddUrl] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError("");
    api
      .getCollection(id)
      .then((c) => {
        if (cancelled) return;
        setOriginal(c);
        setTitle(c.title);
        setItems(c.items);
      })
      .catch((e) => {
        if (cancelled) return;
        setLoadError(e instanceof ApiError && e.status === 404 ? "This collection no longer exists." : (e as Error).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  // A small drag threshold so a click on a tile's remove button isn't read
  // as the start of a drag.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setItems((prev) => {
      const from = prev.findIndex((it) => it.url === active.id);
      const to = prev.findIndex((it) => it.url === over.id);
      if (from < 0 || to < 0) return prev;
      return arrayMove(prev, from, to);
    });
  };

  const removeItem = (url: string) => setItems((prev) => prev.filter((it) => it.url !== url));

  const renameItem = (url: string, name: string) => setItems((prev) => prev.map((it) => (it.url === url ? { ...it, name } : it)));

  const addItem = (e: FormEvent) => {
    e.preventDefault();
    const url = addUrl.trim();
    if (!url) return;
    if (items.some((it) => it.url === url)) {
      toast.error("That URL is already in this collection.");
      return;
    }
    setItems((prev) => [...prev, { url, name: urlFilename(url) }]);
    setAddUrl("");
  };

  const dirty = useMemo(() => {
    if (!original) return false;
    if (title.trim() !== original.title) return true;
    if (items.length !== original.items.length) return true;
    return items.some((it, i) => it.url !== original.items[i]?.url || it.name !== original.items[i]?.name);
  }, [original, title, items]);

  const save = async () => {
    if (!original || saving) return;
    if (!title.trim()) {
      toast.error("Title is required.");
      return;
    }
    setSaving(true);
    try {
      const saved = await api.updateCollection(original.id, { title: title.trim(), items });
      setOriginal(saved);
      setTitle(saved.title);
      setItems(saved.items);
      toast.success("Collection saved.");
    } catch (e) {
      const status = e instanceof ApiError ? e.status : 0;
      toast.error(status === 403 ? "You don't have permission to edit this collection." : `Couldn't save. ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  // Guard against losing edits on the way out.
  const leave = () => {
    if (dirty && !confirm("Discard unsaved changes?")) return;
    navigate("/library");
  };

  if (loading) {
    return (
      <main className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
        <Loader2 className="h-6 w-6 animate-spin text-accent" />
        <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Loading collection…</span>
      </main>
    );
  }
  if (loadError || !original) {
    return (
      <main className="mx-auto flex min-h-[50vh] max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
        <Layers className="h-7 w-7 text-text-dim" />
        <p className="text-sm text-muted-foreground">{loadError || "Collection not found."}</p>
        <Button variant="outline" size="sm" onClick={() => navigate("/library")}>
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to library
        </Button>
      </main>
    );
  }

  // Synced collections track a storage folder live — the editor becomes
  // a read-only view (title, item count, items are all derived from the
  // bucket and managed there).
  const synced = original.source !== null;

  if (synced) {
    return (
      <main className="mx-auto max-w-5xl px-4 pb-10 sm:px-6">
        <div className="sticky top-0 z-20 -mx-4 border-b border-border bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={leave}
              aria-label="Back to library"
              title="Back to library"
              className="flex h-10 w-10 shrink-0 items-center justify-center border border-border bg-bg-elevated/50 text-foreground transition hover:bg-bg-elevated/80"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-foreground">{original.title}</div>
              <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-text-dim">Synced with folder</div>
            </div>
            <span className="shrink-0 font-mono text-[11px] text-text-dim">
              {items.length} {items.length === 1 ? "item" : "items"}
            </span>
          </div>
        </div>

        <div className="mt-4 border border-border bg-bg-elevated/40 p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Layers className="h-3.5 w-3.5 text-accent" />
            Synced with a storage folder
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            This collection mirrors <span className="font-mono text-foreground/80">/{original.source!.folderPrefix}</span> live. Add or remove files in that folder to change what
            plays here — the items here aren't editable.
          </p>
        </div>

        <div className="mt-3">
          <div className="section-label muted mb-2">Items · {items.length}</div>
          {items.length === 0 ? (
            <div className="border border-border bg-bg-elevated/40 px-4 py-10 text-center font-mono text-[11px] text-text-dim">No media in the source folder.</div>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {items.map((it, i) => (
                <ReadOnlyTile key={it.url} item={it} index={i} />
              ))}
            </ul>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-4 pb-10 sm:px-6">
      {/* Sticky action bar — title + save stay reachable while scrolling. */}
      <div className="sticky top-0 z-20 -mx-4 border-b border-border bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={leave}
            aria-label="Back to library"
            title="Back to library"
            className="flex h-10 w-10 shrink-0 items-center justify-center border border-border bg-bg-elevated/50 text-foreground transition hover:bg-bg-elevated/80"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Collection title"
            aria-label="Collection title"
            className="h-10 flex-1 text-sm font-medium"
          />
          <span className="hidden shrink-0 font-mono text-[11px] text-text-dim sm:inline">
            {items.length} {items.length === 1 ? "item" : "items"}
          </span>
          <Button variant="accent" onClick={save} disabled={saving || !dirty || !title.trim()} className="h-10 shrink-0">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {dirty ? "Save changes" : "Saved"}
          </Button>
        </div>
      </div>

      <form onSubmit={addItem} className="mt-4 flex gap-2">
        <Input
          value={addUrl}
          onChange={(e) => setAddUrl(e.target.value)}
          placeholder="https://…  add a video, audio, or image URL"
          className="flex-1"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
        />
        <Button type="submit" variant="outline" disabled={!addUrl.trim()}>
          <Plus className="h-3.5 w-3.5" />
          Add
        </Button>
      </form>

      <div className="mt-3">
        <div className="section-label muted mb-2">
          Items · {items.length} <span className="text-text-dim">· drag to reorder</span>
        </div>
        {items.length === 0 ? (
          <div className="border border-border bg-bg-elevated/40 px-4 py-10 text-center font-mono text-[11px] text-text-dim">
            No items yet — add a URL above, or add a folder from Storage.
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={items.map((it) => it.url)} strategy={rectSortingStrategy}>
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {items.map((it, i) => (
                  <SortableTile key={it.url} item={it} index={i} onRename={(name) => renameItem(it.url, name)} onRemove={() => removeItem(it.url)} />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        )}
      </div>
    </main>
  );
}

// Read-only tile — no rename, no remove, no drag handle. Used by the
// synced-collection view where the storage folder is the source of truth.
function ReadOnlyTile({ item, index }: { item: CollectionItem; index: number }) {
  const kind = mediaKind(item.url);
  const label = item.name || urlFilename(item.url);
  return (
    <li className="border border-border bg-bg-elevated/40">
      <div className="relative aspect-square w-full overflow-hidden bg-black">
        {kind === "image" ? (
          <img src={item.url} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-text-dim">{kind === "audio" ? <Music className="h-7 w-7" /> : <Film className="h-7 w-7" />}</span>
        )}
        <span className="absolute left-1 top-1 bg-black/70 px-1 font-mono text-[10px] text-white/80">{index + 1}</span>
      </div>
      <div className="block w-full truncate border-t border-border px-2 py-1.5 text-[11px] text-foreground" title={label}>
        {label}
      </div>
    </li>
  );
}

function SortableTile({ item, index, onRename, onRemove }: { item: CollectionItem; index: number; onRename: (name: string) => void; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.url });
  const [editing, setEditing] = useState(false);
  const kind = mediaKind(item.url);
  const label = item.name || urlFilename(item.url);
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("group relative border border-border bg-bg-elevated/40", isDragging && "z-10 opacity-80 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.8)]")}
    >
      {/* The thumbnail is the drag handle; the name below is click-to-rename
          and the remove button is a sibling — so neither starts a drag. */}
      <div {...attributes} {...listeners} className="relative block aspect-square w-full cursor-grab touch-none overflow-hidden bg-black active:cursor-grabbing">
        {kind === "image" ? (
          <img src={item.url} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-text-dim">{kind === "audio" ? <Music className="h-7 w-7" /> : <Film className="h-7 w-7" />}</span>
        )}
        <span className="absolute left-1 top-1 bg-black/70 px-1 font-mono text-[10px] text-white/80">{index + 1}</span>
      </div>
      {editing ? (
        <TileNameInput
          initial={item.name || urlFilename(item.url)}
          onCommit={(name) => {
            onRename(name);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          title="Click to rename"
          className="block w-full truncate border-t border-border px-2 py-1.5 text-left text-[11px] text-foreground transition hover:bg-white/[0.04]"
        >
          {label}
        </button>
      )}
      <button
        type="button"
        aria-label={`Remove ${label}`}
        onClick={onRemove}
        className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center border border-white/15 bg-black/70 text-white/85 opacity-0 backdrop-blur transition hover:text-accent focus-visible:opacity-100 group-hover:opacity-100"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}

// Inline editor for an item's display name. Enter / blur commit, Escape
// cancels; a guard ref keeps the unmount-blur from double-firing.
function TileNameInput({ initial, onCommit, onCancel }: { initial: string; onCommit: (name: string) => void; onCancel: () => void }) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  const doneRef = useRef(false);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  const commit = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onCommit(value.trim() || initial);
  };
  const cancel = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onCancel();
  };

  return (
    <input
      ref={ref}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        } else if (e.key === "Escape") {
          e.preventDefault();
          cancel();
        }
      }}
      onBlur={commit}
      aria-label="Item name"
      className="block w-full border-t border-accent/50 bg-input/80 px-2 py-1.5 text-[11px] text-foreground focus:outline-none"
    />
  );
}
