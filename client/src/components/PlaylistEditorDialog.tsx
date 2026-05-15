import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowDown, ArrowUp, Loader2, Plus, Trash2 } from "lucide-react";
import type { Playlist, Video } from "@shared/protocol";
import { Modal } from "@/components/Modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { urlFilename } from "@/lib/utils";

// Create a new playlist or edit an existing one. The whole working set
// lives in local state and is sent in a single PATCH/POST on save —
// avoids the complexity of streaming reorders one mutation at a time.
export function PlaylistEditorDialog({
  open,
  initial,
  library,
  onClose,
  onSaved,
}: {
  open: boolean;
  initial: Playlist | null; // null = creating
  library: Video[];
  onClose: () => void;
  onSaved: (playlist: Playlist) => void;
}) {
  const [title, setTitle] = useState("");
  const [videoIds, setVideoIds] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [adding, setAdding] = useState("");

  useEffect(() => {
    if (!open) return;
    setTitle(initial?.title ?? "");
    setVideoIds(initial?.videoIds ?? []);
    setError("");
    setPending(false);
    setAdding("");
  }, [open, initial]);

  const videosById = useMemo(() => {
    const m = new Map<string, Video>();
    for (const v of library) m.set(v.id, v);
    return m;
  }, [library]);

  // Library entries not yet in the working set — feeds the add dropdown.
  const available = useMemo(() => library.filter((v) => !videoIds.includes(v.id)), [library, videoIds]);

  const swap = (i: number, j: number) => {
    if (i < 0 || j < 0 || i >= videoIds.length || j >= videoIds.length) return;
    setVideoIds((prev) => {
      const next = [...prev];
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });
  };

  const remove = (id: string) => setVideoIds((prev) => prev.filter((x) => x !== id));

  const add = () => {
    if (!adding) return;
    setVideoIds((prev) => (prev.includes(adding) ? prev : [...prev, adding]));
    setAdding("");
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (pending) return;
    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    setError("");
    setPending(true);
    try {
      const saved = initial
        ? await api.updatePlaylist(initial.id, { title: title.trim(), videoIds })
        : await api.createPlaylist({ title: title.trim(), videoIds });
      onSaved(saved);
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setPending(false);
    }
  };

  return (
    <Modal open={open} title={initial ? "Edit playlist" : "New playlist"} onClose={pending ? () => {} : onClose} className="max-w-lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block">
          <span className="section-label muted mb-1.5 block">Title</span>
          <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Saturday movie night" required />
        </label>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="section-label muted">Tracks · {videoIds.length}</span>
          </div>
          {videoIds.length === 0 ? (
            <div className="border border-border bg-bg-elevated/40 px-3 py-4 text-center font-mono text-[11px] text-text-dim">
              No tracks yet — add one below.
            </div>
          ) : (
            <ul className="border border-border">
              {videoIds.map((id, i) => {
                const video = videosById.get(id);
                return (
                  <li
                    key={id}
                    className="flex items-center gap-2 border-b border-border px-2 py-2 last:border-b-0"
                  >
                    <span className="w-6 shrink-0 text-right font-mono text-[10px] text-text-dim">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      {video ? (
                        <>
                          <div className="truncate text-sm text-foreground">{video.title}</div>
                          <div className="truncate font-mono text-[10px] text-text-dim" title={video.url}>
                            {urlFilename(video.url)}
                          </div>
                        </>
                      ) : (
                        <div className="text-sm italic text-text-dim">Removed from library</div>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5">
                      <button
                        type="button"
                        aria-label="Move up"
                        onClick={() => swap(i, i - 1)}
                        disabled={i === 0}
                        className="flex h-7 w-7 items-center justify-center text-text-dim transition hover:text-foreground disabled:opacity-20"
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label="Move down"
                        onClick={() => swap(i, i + 1)}
                        disabled={i === videoIds.length - 1}
                        className="flex h-7 w-7 items-center justify-center text-text-dim transition hover:text-foreground disabled:opacity-20"
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label="Remove"
                        onClick={() => remove(id)}
                        className="flex h-7 w-7 items-center justify-center text-text-dim transition hover:text-accent"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {available.length > 0 && (
            <div className="mt-2 flex items-center gap-2">
              <select
                value={adding}
                onChange={(e) => setAdding(e.target.value)}
                className="h-9 flex-1 border border-border bg-input/60 px-2 font-mono text-[12px] text-foreground focus-visible:border-accent/60 focus-visible:outline-none"
              >
                <option value="">— pick a library entry —</option>
                {available.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.title}
                  </option>
                ))}
              </select>
              <Button type="button" variant="outline" size="sm" disabled={!adding} onClick={add}>
                <Plus className="h-3.5 w-3.5" />
                Add
              </Button>
            </div>
          )}
        </div>

        {error && (
          <div className="border border-accent/40 bg-accent/10 px-3 py-2 font-mono text-[12px] text-foreground">{error}</div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" variant="accent" disabled={pending || !title.trim()}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {initial ? "Save changes" : "Create playlist"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
