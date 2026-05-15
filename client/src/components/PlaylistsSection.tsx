import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ListMusic, Pencil, Play, Plus, Trash2 } from "lucide-react";
import type { Playlist, Video } from "@shared/protocol";
import { Button } from "@/components/ui/button";
import { PlaylistEditorDialog } from "@/components/PlaylistEditorDialog";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

// Playlists feed for the Library page. Plays a playlist by sending the
// user to the single per-space watch surface with ?playlist=<id> — the
// Watch page pops that off on connect and dispatches loadPlaylist.
export function PlaylistsSection({
  playlists,
  library,
  onChange,
}: {
  playlists: Playlist[];
  library: Video[];
  onChange: (next: Playlist[]) => void;
}) {
  const navigate = useNavigate();
  const [editing, setEditing] = useState<Playlist | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);

  const openNew = () => {
    setEditing(null);
    setEditorOpen(true);
  };
  const openEdit = (p: Playlist) => {
    setEditing(p);
    setEditorOpen(true);
  };

  const handleSaved = (saved: Playlist) => {
    onChange(
      // Update in place if existing, prepend if new.
      playlists.some((p) => p.id === saved.id)
        ? playlists.map((p) => (p.id === saved.id ? saved : p))
        : [saved, ...playlists],
    );
  };

  const handleDelete = async (p: Playlist) => {
    // Caller already two-step-confirmed via the row's armed state.
    await api.deletePlaylist(p.id);
    onChange(playlists.filter((x) => x.id !== p.id));
  };

  const handlePlay = (p: Playlist) => {
    if (p.videoIds.length === 0) return;
    navigate(`/watch?playlist=${encodeURIComponent(p.id)}`);
  };

  return (
    <section>
      <header className="mb-3 flex items-center justify-between">
        <span className="section-label muted">Playlists · {playlists.length}</span>
        <Button variant="outline" size="sm" onClick={openNew}>
          <Plus className="h-3.5 w-3.5" />
          New playlist
        </Button>
      </header>

      {playlists.length === 0 ? (
        <div className="border border-border bg-bg-elevated/40 px-4 py-6 text-center">
          <ListMusic className="mx-auto h-5 w-5 text-text-dim" />
          <p className="mt-2 text-sm text-muted-foreground">No playlists yet.</p>
          <p className="font-mono text-[11px] text-text-dim">Group library entries to play back-to-back.</p>
        </div>
      ) : (
        <ul className="border-y border-border">
          {playlists.map((p) => (
            <PlaylistRow
              key={p.id}
              playlist={p}
              onPlay={() => handlePlay(p)}
              onEdit={() => openEdit(p)}
              onDelete={() => handleDelete(p)}
            />
          ))}
        </ul>
      )}

      <PlaylistEditorDialog
        open={editorOpen}
        initial={editing}
        library={library}
        onClose={() => setEditorOpen(false)}
        onSaved={handleSaved}
      />
    </section>
  );
}

// Two-step delete mirrors VideoRow in Library: first click arms the
// button (turns accent, pulses), second click within 3s commits. Same
// pattern across the app — no native confirm() popups.
function PlaylistRow({
  playlist,
  onPlay,
  onEdit,
  onDelete,
}: {
  playlist: Playlist;
  onPlay: () => void;
  onEdit: () => void;
  onDelete: () => Promise<void>;
}) {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);

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

  return (
    <li className="flex items-center gap-3 border-b border-border px-3 py-3 transition-colors last:border-b-0 hover:bg-white/[0.02]">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-foreground">{playlist.title}</div>
        <div className="font-mono text-[11px] text-text-dim">
          {playlist.videoIds.length} {playlist.videoIds.length === 1 ? "track" : "tracks"}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          aria-label="Play"
          onClick={onPlay}
          disabled={playlist.videoIds.length === 0}
          className="flex h-8 w-8 items-center justify-center text-foreground transition hover:text-accent disabled:opacity-30"
        >
          <Play className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="Edit"
          onClick={onEdit}
          className="flex h-8 w-8 items-center justify-center text-text-dim transition hover:text-foreground"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          aria-label={armed ? "Click again to confirm delete" : "Delete"}
          title={armed ? "Click again to confirm" : "Delete"}
          onClick={() => void triggerDelete()}
          disabled={busy}
          className={cn(
            "flex h-8 w-8 items-center justify-center transition",
            armed
              ? "animate-pulse-soft bg-accent text-white"
              : "text-text-dim hover:text-accent",
          )}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </li>
  );
}
