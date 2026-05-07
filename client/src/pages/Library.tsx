import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  Captions,
  Check,
  ChevronDown,
  Copy,
  Library as LibraryIcon,
  Pencil,
  Plus,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import type { Subtitle, Video } from "@shared/protocol";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export default function Library() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    api
      .listVideos()
      .then((list) => {
        if (!cancelled) setVideos(list);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleAdd = async (input: { url: string; title?: string }) => {
    const created = await api.createVideo(input);
    setVideos((prev) => {
      const without = prev.filter((v) => v.id !== created.id);
      return [created, ...without];
    });
  };

  const handleUpdate = async (
    id: string,
    patch: { title?: string; subtitles?: Subtitle[] },
  ) => {
    const updated = await api.updateVideo(id, patch);
    setVideos((prev) => prev.map((v) => (v.id === updated.id ? updated : v)));
  };

  const handleRemove = async (id: string) => {
    await api.deleteVideo(id);
    setVideos((prev) => prev.filter((v) => v.id !== id));
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
      <LibraryHeader count={videos.length} />

      <Card className="animate-fade-in">
        <CardContent className="p-6 pt-6">
          <AddVideoForm onAdd={handleAdd} />
        </CardContent>
      </Card>

      {error && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading library…</div>
      ) : videos.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="flex flex-col gap-2">
          {videos.map((v) => (
            <VideoRow
              key={v.id}
              video={v}
              onUpdate={handleUpdate}
              onRemove={handleRemove}
            />
          ))}
        </ul>
      )}
    </main>
  );
}

function LibraryHeader({ count }: { count: number }) {
  return (
    <header className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon">
          <Link to="/" aria-label="Back to home">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground">
            Saved
          </div>
          <h1 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <LibraryIcon className="h-4 w-4 text-violet-300" />
            Library
          </h1>
        </div>
      </div>
      <span className="text-xs text-muted-foreground">
        {count} {count === 1 ? "video" : "videos"}
      </span>
    </header>
  );
}

function AddVideoForm({
  onAdd,
}: {
  onAdd: (input: { url: string; title?: string }) => Promise<void>;
}) {
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedUrl = url.trim();
    if (!trimmedUrl) return;
    setBusy(true);
    setError("");
    try {
      await onAdd({ url: trimmedUrl, title: title.trim() || undefined });
      setUrl("");
      setTitle("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="text-xs uppercase tracking-widest text-muted-foreground">
        Add a video
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
        />
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title (optional)"
          className="sm:w-56"
        />
        <Button type="submit" variant="accent" disabled={!url.trim() || busy}>
          <Plus className="h-4 w-4" />
          Add
        </Button>
      </div>
      {error && <p className="text-xs text-red-300">{error}</p>}
    </form>
  );
}

function VideoRow({
  video,
  onUpdate,
  onRemove,
}: {
  video: Video;
  onUpdate: (
    id: string,
    patch: { title?: string; subtitles?: Subtitle[] },
  ) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(video.title);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const startEdit = () => {
    setDraftTitle(video.title);
    setEditing(true);
  };

  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onUpdate(video.id, { title: draftTitle });
      setEditing(false);
    } finally {
      setBusy(false);
    }
  };

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(video.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  };

  const remove = async () => {
    if (busy) return;
    if (!confirm(`Delete "${video.title}"?`)) return;
    setBusy(true);
    try {
      await onRemove(video.id);
    } catch {
      setBusy(false);
    }
  };

  const subCount = video.subtitles.length;

  return (
    <li className="glass rounded-xl p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          {editing ? (
            <div className="flex gap-2">
              <Input
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") void save();
                  if (e.key === "Escape") setEditing(false);
                }}
              />
              <Button size="sm" variant="accent" onClick={save} disabled={busy}>
                <Check className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setEditing(false)}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-medium text-foreground">
                {video.title}
              </span>
              <button
                type="button"
                onClick={startEdit}
                className="text-muted-foreground transition hover:text-foreground"
                aria-label="Edit title"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
            {video.url}
          </p>
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <span className="px-2 tabular-nums">{timeAgo(video.addedAt)}</span>
          <Button
            size="icon"
            variant="ghost"
            onClick={copyUrl}
            aria-label="Copy URL"
          >
            {copied ? (
              <Check className="h-4 w-4 text-emerald-400" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={remove}
            aria-label="Delete"
            disabled={busy}
          >
            <Trash2 className="h-4 w-4 text-red-300" />
          </Button>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="mt-3 flex w-full items-center justify-between rounded-md border border-white/5 bg-white/[0.02] px-3 py-1.5 text-xs text-muted-foreground transition hover:bg-white/[0.05]"
      >
        <span className="flex items-center gap-2">
          <Captions className="h-3.5 w-3.5" />
          {subCount === 0 ? "No subtitles" : `${subCount} subtitle${subCount === 1 ? "" : "s"}`}
        </span>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 transition-transform",
            expanded && "rotate-180",
          )}
        />
      </button>

      {expanded && (
        <SubtitlesPanel video={video} onUpdate={onUpdate} />
      )}
    </li>
  );
}

function SubtitlesPanel({
  video,
  onUpdate,
}: {
  video: Video;
  onUpdate: (
    id: string,
    patch: { title?: string; subtitles?: Subtitle[] },
  ) => Promise<void>;
}) {
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [lang, setLang] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file later
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const text = await file.text();
      const stored = await api.uploadSubtitle({
        content: text,
        filename: file.name,
      });
      setUrl(stored.url);
      const stem = file.name.replace(/\.(srt|vtt)$/i, "").trim();
      if (!label && stem) setLabel(stem);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const addSubtitle = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;
    setBusy(true);
    setError("");
    try {
      const next: Subtitle[] = [
        ...video.subtitles,
        {
          id: "",
          url: trimmed,
          label: label.trim(),
          lang: lang.trim(),
        },
      ];
      await onUpdate(video.id, { subtitles: next });
      setUrl("");
      setLabel("");
      setLang("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setError("");
    try {
      await onUpdate(video.id, {
        subtitles: video.subtitles.filter((s) => s.id !== id),
      });
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="mt-2 space-y-2 rounded-md border border-white/5 bg-white/[0.02] p-3">
      {video.subtitles.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {video.subtitles.map((s) => (
            <li
              key={s.id}
              className="flex items-center gap-2 rounded-md border border-white/5 bg-white/[0.03] px-2.5 py-1.5"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-xs font-medium text-foreground/90">
                    {s.label || s.url}
                  </span>
                  {s.lang && (
                    <span className="rounded bg-violet-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-violet-200">
                      {s.lang}
                    </span>
                  )}
                </div>
                <p className="truncate font-mono text-[10px] text-muted-foreground">
                  {s.url}
                </p>
              </div>
              <button
                type="button"
                onClick={() => remove(s.id)}
                aria-label={`Remove ${s.label || s.url}`}
                className="shrink-0 rounded-md p-1 text-muted-foreground transition hover:bg-white/5 hover:text-red-300"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <input
        ref={fileRef}
        type="file"
        accept=".srt,.vtt,text/vtt,application/x-subrip"
        className="hidden"
        onChange={handleFile}
      />

      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        className="flex items-center gap-1.5 self-start text-xs text-muted-foreground transition hover:text-foreground disabled:opacity-50"
      >
        <Upload className="h-3.5 w-3.5" />
        {uploading ? "Uploading…" : "Upload .srt or .vtt file"}
      </button>

      <form onSubmit={addSubtitle} className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Subtitle URL or upload above"
          className="h-9 sm:flex-1"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
        />
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Label (e.g. English)"
          className="h-9 sm:w-40"
        />
        <Input
          value={lang}
          onChange={(e) => setLang(e.target.value)}
          placeholder="Lang (e.g. en)"
          className="h-9 sm:w-24"
          autoCapitalize="off"
        />
        <Button
          type="submit"
          variant="outline"
          size="sm"
          disabled={!url.trim() || busy}
        >
          <Plus className="h-3.5 w-3.5" />
          Add
        </Button>
      </form>

      {error && <p className="text-xs text-red-300">{error}</p>}
    </div>
  );
}

function EmptyState() {
  return (
    <Card>
      <CardContent className="p-10 text-center">
        <div className="text-sm font-medium text-foreground/80">
          No videos saved yet
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Paste a URL into a room or use the form above. New URLs auto-save
          here.
        </p>
      </CardContent>
    </Card>
  );
}

function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
