import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Film, ImageIcon, Layers, Pencil, Play, Plus, Share2, Trash2 } from "lucide-react";
import type { Collection } from "@shared/protocol";
import { api, ApiError } from "@/lib/api";
import { useToast } from "@/components/Toast";
import { Modal } from "@/components/Modal";
import { ShareDialog } from "@/components/ShareDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn, isImageUrl } from "@/lib/utils";

// Collections feed for the Library page. Collections are usually built
// from storage folders (the file browser's "New collection" action);
// "New collection" here starts an empty one. Editing opens the dedicated
// full-page editor (/collections/:id); playing sends the space to the
// synced theater with ?collection=<id>.
export function CollectionsSection({ collections, onChange }: { collections: Collection[]; onChange: (next: Collection[]) => void }) {
  const navigate = useNavigate();
  const toast = useToast();

  const handleNew = async () => {
    try {
      const created = await api.createCollection({ title: "New collection" });
      onChange([created, ...collections]);
      navigate(`/collections/${created.id}`);
    } catch (e) {
      toast.error(`Couldn't create collection. ${(e as Error).message}`);
    }
  };

  const handleDelete = async (col: Collection) => {
    try {
      await api.deleteCollection(col.id);
      onChange(collections.filter((c) => c.id !== col.id));
    } catch (e) {
      const status = e instanceof ApiError ? e.status : 0;
      toast.error(status === 403 ? "You don't have permission to delete this collection." : `Couldn't delete "${col.title}". ${(e as Error).message}`);
    }
  };

  // Used by CollectionCard when the cover URL is saved/cleared. Server
  // returns the full Collection back so we just splice it in by id.
  const handleReplace = (next: Collection) => {
    onChange(collections.map((c) => (c.id === next.id ? next : c)));
  };

  return (
    <section>
      <header className="mb-3 flex items-center justify-between">
        <span className="section-label muted">Collections · {collections.length}</span>
        <Button variant="outline" size="sm" onClick={handleNew}>
          <Plus className="h-3.5 w-3.5" />
          New collection
        </Button>
      </header>

      {collections.length === 0 ? (
        <div className="border border-border bg-bg-elevated/40 px-4 py-6 text-center">
          <Layers className="mx-auto h-5 w-5 text-text-dim" />
          <p className="mt-2 text-sm text-muted-foreground">No collections yet.</p>
          <p className="font-mono text-[11px] text-text-dim">Open a storage folder and choose “New collection”, or start an empty one above.</p>
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {collections.map((c) => (
            <CollectionCard key={c.id} collection={c} onDelete={() => handleDelete(c)} onReplace={handleReplace} />
          ))}
        </ul>
      )}
    </section>
  );
}

// Two-step delete: first click arms (button pulses), second within 3s commits.
function CollectionCard({ collection, onDelete, onReplace }: { collection: Collection; onDelete: () => Promise<void>; onReplace: (next: Collection) => void }) {
  const navigate = useNavigate();
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [coverOpen, setCoverOpen] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);

  const triggerDelete = async () => {
    if (busy) return;
    if (!armed) {
      setArmed(true);
      return;
    }
    setArmed(false);
    setBusy(true);
    try {
      await onDelete();
    } catch {
      setBusy(false);
    }
  };

  const play = () => {
    if (collection.items.length === 0) return;
    navigate(`/watch?collection=${encodeURIComponent(collection.id)}`);
  };

  // Cover resolution order:
  //   1. Explicit `coverUrl` on the collection (user-set, takes priority
  //      even for synced collections).
  //   2. First photo URL among the items — video/audio URLs have no
  //      still frame, so we skip past them.
  //   3. Fallback Film icon.
  const coverSrc = collection.coverUrl || collection.items.find((it) => isImageUrl(it.url))?.url || null;

  return (
    <li className="group relative flex flex-col border border-border bg-bg-elevated/40 transition hover:border-border-hover">
      <button
        type="button"
        onClick={play}
        disabled={collection.items.length === 0}
        className="relative block aspect-[16/10] w-full overflow-hidden bg-black disabled:cursor-not-allowed"
        aria-label={`Play collection ${collection.title}`}
      >
        {coverSrc ? (
          <img src={coverSrc} alt="" loading="lazy" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-text-dim">
            <Film className="h-7 w-7" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/55 to-transparent opacity-0 transition group-hover:opacity-100" />
        {collection.items.length > 0 && (
          <span className="absolute inset-0 flex items-center justify-center opacity-0 transition group-hover:opacity-100">
            <span className="flex h-12 w-12 items-center justify-center border border-white/25 bg-black/55 text-white backdrop-blur">
              <Play className="h-5 w-5 fill-current" />
            </span>
          </span>
        )}
        <span className="absolute bottom-1.5 right-1.5 border border-white/15 bg-black/65 px-1.5 py-0.5 font-mono text-[10px] text-white/85 backdrop-blur">
          {collection.items.length} item{collection.items.length === 1 ? "" : "s"}
        </span>
        {collection.source && (
          <span className="absolute left-1.5 top-1.5 border border-cyan/40 bg-cyan/15 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-cyan backdrop-blur">
            Synced
          </span>
        )}
      </button>
      {/* Cover-edit overlay — top-right of the cover area. Sibling of
          the play button (positioned against the li, which is the
          `relative` container) so we don't end up with nested
          interactive elements. Hover-only at rest, also surfaces on
          keyboard focus. */}
      <button
        type="button"
        aria-label="Set cover image"
        title={collection.coverUrl ? "Change cover" : "Set cover"}
        onClick={() => setCoverOpen(true)}
        className="absolute right-1.5 top-1.5 z-10 flex h-7 w-7 items-center justify-center border border-white/15 bg-black/65 text-white/85 opacity-0 backdrop-blur transition hover:text-white focus-visible:opacity-100 group-hover:opacity-100"
      >
        <ImageIcon className="h-3.5 w-3.5" />
      </button>

      <div className="flex items-center gap-2 px-3 py-2.5">
        <div className="min-w-0 flex-1 truncate text-sm font-medium text-foreground" title={collection.title}>
          {collection.title}
        </div>
        {/* Footer actions fade in on hover so the card reads as a cover +
            title at rest; management surfaces only when you reach for it. */}
        <div className="flex items-center gap-2 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
          <button
            type="button"
            aria-label="Share collection"
            title="Create a share link"
            onClick={() => setShareOpen(true)}
            className="flex h-8 w-8 items-center justify-center text-text-dim transition hover:text-foreground"
          >
            <Share2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            aria-label="Edit collection"
            title="Edit collection"
            onClick={() => navigate(`/collections/${collection.id}`)}
            className="flex h-8 w-8 items-center justify-center text-text-dim transition hover:text-foreground"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            aria-label={armed ? "Click again to confirm delete" : "Delete collection"}
            title={armed ? "Click again to confirm" : "Delete"}
            onClick={() => void triggerDelete()}
            disabled={busy}
            className={cn("flex h-8 w-8 items-center justify-center transition", armed ? "animate-pulse-soft bg-accent text-white" : "text-text-dim hover:text-accent")}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      {shareOpen && <ShareDialog target={{ kind: "collection", collectionId: collection.id, title: collection.title }} onClose={() => setShareOpen(false)} />}
      <CoverEditDialog open={coverOpen} collection={collection} onClose={() => setCoverOpen(false)} onSaved={onReplace} />
    </li>
  );
}

// Tiny editor for the cover URL. Lenient — accepts any string and lets
// <img> fall back to a placeholder if loading fails. Live preview
// updates as the user types (debounce-free; <img> is its own throttle).
// Save / Clear / Cancel actions; Clear is hidden when nothing's set.
function CoverEditDialog({
  open,
  collection,
  onClose,
  onSaved,
}: {
  open: boolean;
  collection: Collection;
  onClose: () => void;
  onSaved: (next: Collection) => void;
}) {
  const toast = useToast();
  const [draft, setDraft] = useState(collection.coverUrl ?? "");
  const [busy, setBusy] = useState<"save" | "clear" | null>(null);
  const [previewError, setPreviewError] = useState(false);

  // Re-seed when the dialog reopens against a different collection or
  // the saved value changes underneath us (e.g. from another tab).
  useEffect(() => {
    if (open) {
      setDraft(collection.coverUrl ?? "");
      setPreviewError(false);
    }
  }, [open, collection.coverUrl]);

  const save = async (next: string | null) => {
    const kind = next === null ? "clear" : "save";
    if (busy) return;
    setBusy(kind);
    try {
      const updated = await api.updateCollection(collection.id, { coverUrl: next });
      onSaved(updated);
      onClose();
    } catch (e) {
      const status = e instanceof ApiError ? e.status : 0;
      toast.error(status === 403 ? "You don't have permission to edit this collection." : `Couldn't update cover. ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  const trimmed = draft.trim();
  const hasChange = trimmed !== (collection.coverUrl ?? "");

  return (
    <Modal open={open} title="Collection cover" onClose={onClose} className="max-w-md">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save(trimmed || null);
        }}
        className="flex flex-col gap-4"
      >
        <label className="block">
          <span className="section-label muted mb-1.5 block">Image URL</span>
          <Input
            autoFocus
            type="url"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setPreviewError(false);
            }}
            placeholder="https://example.com/cover.jpg"
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
          />
          <span className="mt-1.5 block font-mono text-[11px] text-text-dim">
            Leave blank and save to use an auto-picked cover (first photo in the collection).
          </span>
        </label>

        {/* Live preview — same 16/10 aspect as the card so the user
            sees roughly how it'll land. <img> failures bump
            `previewError` so we show a hint instead of a broken icon. */}
        <div className="aspect-[16/10] w-full overflow-hidden border border-border bg-black">
          {trimmed && !previewError ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={trimmed} alt="" className="h-full w-full object-cover" onError={() => setPreviewError(true)} />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-text-dim">
              <ImageIcon className="h-6 w-6" />
              <span className="font-mono text-[11px]">{previewError ? "Couldn't load that URL" : "No cover"}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2">
          {collection.coverUrl && (
            <Button type="button" variant="ghost" size="sm" disabled={busy !== null} onClick={() => void save(null)}>
              {busy === "clear" ? "Clearing…" : "Clear"}
            </Button>
          )}
          <Button type="button" variant="ghost" size="sm" disabled={busy !== null} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="accent" size="sm" disabled={busy !== null || !hasChange}>
            {busy === "save" ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
