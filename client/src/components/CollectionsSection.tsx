import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Film, ImageIcon, Layers, Loader2, MoreVertical, Pencil, Play, Plus, Share2, Trash2 } from "lucide-react";
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
      navigate(`/collections/${created.id}`, { state: { hasAppReturn: true } });
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
  // Lifted from CardActionsMenu so we can raise the whole card above
  // its siblings while the dropdown is open — without it, the next
  // card's kebab paints on top of this card's menu (same z-index,
  // later DOM wins the stacking contest).
  const [menuOpen, setMenuOpen] = useState(false);

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
    <li className={cn("group relative flex flex-col border border-border bg-bg-elevated/40 transition hover:border-border-hover", menuOpen && "z-20")}>
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
      {/* Always-visible kebab — opens a small menu with cover /
          share / edit / delete. Lives on the cover (sibling of the
          play button) so the title row keeps the full card width.
          Always rendered (no hover-gating) so the affordance is
          equally reachable on touch and pointer devices. */}
      <CardActionsMenu
        collection={collection}
        armed={armed}
        busy={busy}
        open={menuOpen}
        onOpenChange={setMenuOpen}
        onSetCover={() => setCoverOpen(true)}
        onShare={() => setShareOpen(true)}
        onEdit={() => navigate(`/collections/${collection.id}`, { state: { hasAppReturn: true } })}
        onDelete={() => void triggerDelete()}
      />

      <div className="px-3 py-2.5">
        <div className="truncate text-sm font-medium text-foreground" title={collection.title}>
          {collection.title}
        </div>
      </div>
      {shareOpen && <ShareDialog target={{ kind: "collection", collectionId: collection.id, title: collection.title }} onClose={() => setShareOpen(false)} />}
      <CoverEditDialog open={coverOpen} collection={collection} onClose={() => setCoverOpen(false)} onSaved={onReplace} />
    </li>
  );
}

// Always-visible kebab + popover menu for the per-card actions. Same
// affordance on desktop and touch — one tap/click opens, another
// selects. Mirrors the click-outside + Escape close pattern used by
// ExportMenu / ClearMenu so the three dropdowns in the app feel
// identical.
function CardActionsMenu({
  collection,
  armed,
  busy,
  open,
  onOpenChange,
  onSetCover,
  onShare,
  onEdit,
  onDelete,
}: {
  collection: Collection;
  armed: boolean;
  busy: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSetCover: () => void;
  onShare: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOpenChange(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onEsc);
    return () => {
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onEsc);
    };
  }, [open, onOpenChange]);

  // Non-destructive items close the menu after firing — natural
  // "did the thing" feedback. Delete is special: the first click
  // arms (parent flips `armed`); we keep the menu open so the
  // confirmation row stays reachable for the second click.
  const choose = (fn: () => void) => {
    fn();
    onOpenChange(false);
  };

  return (
    <div ref={ref} className="absolute right-1.5 top-1.5 z-10">
      <button
        type="button"
        aria-label="Collection actions"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Actions"
        onClick={() => onOpenChange(!open)}
        className="flex h-7 w-7 items-center justify-center border border-white/15 bg-black/65 text-white/85 backdrop-blur transition hover:text-white"
      >
        <MoreVertical className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1.5 min-w-[10.5rem] border border-white/10 bg-[#16181f]/95 p-1 shadow-[0_24px_60px_-12px_rgba(0,0,0,0.85)] backdrop-blur-xl"
        >
          <MenuItem icon={<ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />} onClick={() => choose(onSetCover)}>
            {collection.coverUrl ? "Change cover" : "Set cover"}
          </MenuItem>
          <MenuItem icon={<Share2 className="h-3.5 w-3.5 text-muted-foreground" />} onClick={() => choose(onShare)}>
            Share
          </MenuItem>
          <MenuItem icon={<Pencil className="h-3.5 w-3.5 text-muted-foreground" />} onClick={() => choose(onEdit)}>
            Edit
          </MenuItem>
          <DeleteMenuItem armed={armed} busy={busy} onClick={onDelete} />
        </div>
      )}
    </div>
  );
}

function MenuItem({ icon, onClick, children }: { icon: React.ReactNode; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" role="menuitem" onClick={onClick} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground transition hover:bg-white/[0.04]">
      {icon}
      {children}
    </button>
  );
}

// Destructive item — keeps its own arm-then-confirm visual state.
// Stays inside the open menu between the two clicks; the parent's
// 3-second arm timeout drops it back to idle on inaction.
function DeleteMenuItem({ armed, busy, onClick }: { armed: boolean; busy: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={busy}
      className={cn(
        "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition disabled:cursor-not-allowed disabled:opacity-50",
        armed ? "animate-pulse-soft bg-accent/15 text-accent" : "text-foreground hover:bg-white/[0.04]",
      )}
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" /> : <Trash2 className={cn("h-3.5 w-3.5", armed ? "text-accent" : "text-accent/80")} />}
      <span className="flex-1 whitespace-nowrap">{busy ? "Deleting…" : armed ? "Click again to confirm" : "Delete"}</span>
    </button>
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
