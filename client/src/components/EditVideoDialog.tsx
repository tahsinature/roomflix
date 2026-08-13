import { useEffect, useState } from "react";
import { Copy, Pencil, Plus, Trash2 } from "lucide-react";
import type { Subtitle, Video, VideoHealth } from "@shared/protocol";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CopyButton } from "@/components/CopyButton";
import { HealthDot } from "@/components/HealthDot";
import { Modal } from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { copyJsonToClipboard } from "@/lib/jsonExport";
import { toMediaBundle } from "@/lib/mediaBundle";

// Centralized edit surface for a single library entry. Hosts title editing,
// URL display + copy, and subtitle management. Shared between the Library
// page (where it's opened per row) and the Storage page (where it's opened
// from the "In library" badge on a bucket file row).
//
// `health` is optional — Storage doesn't run a probe, so it passes undefined
// and subtitle health dots fall back to "unverified".
export function EditVideoDialog({
  video,
  health,
  open,
  onClose,
  onUpdate,
}: {
  video: Video;
  health?: VideoHealth | undefined;
  open: boolean;
  onClose: () => void;
  onUpdate: (id: string, patch: { title?: string; subtitles?: Subtitle[] }) => Promise<void>;
}) {
  const toast = useToast();
  const [draftTitle, setDraftTitle] = useState(video.title);
  const [savingTitle, setSavingTitle] = useState(false);
  const [titleErr, setTitleErr] = useState("");

  useEffect(() => {
    setDraftTitle(video.title);
    setTitleErr("");
  }, [video.id, video.title, open]);

  const dirty = draftTitle.trim() !== video.title && draftTitle.trim() !== "";

  const saveTitle = async () => {
    if (savingTitle || !dirty) return;
    setSavingTitle(true);
    setTitleErr("");
    try {
      await onUpdate(video.id, { title: draftTitle.trim() });
    } catch (err) {
      setTitleErr((err as Error).message);
    } finally {
      setSavingTitle(false);
    }
  };

  const copyMediaJson = async () => {
    const copied = await copyJsonToClipboard(toMediaBundle(video));
    if (copied) toast.success("Media JSON copied.");
    else toast.error("Clipboard access was blocked by the browser.");
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit media"
      headerAction={
        <Button type="button" variant="outline" size="sm" onClick={copyMediaJson} aria-label="Copy media JSON" title="Copy media JSON">
          <Copy className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Copy JSON</span>
        </Button>
      }
    >
      <div className="space-y-6">
        <section>
          <label className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Title</label>
          <div className="mt-2 flex gap-2">
            <Input
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void saveTitle();
              }}
              disabled={savingTitle}
              autoFocus
              className="h-10"
            />
            <Button variant={dirty ? "accent" : "outline"} onClick={saveTitle} disabled={!dirty || savingTitle} className="h-10 shrink-0">
              {savingTitle ? "Saving…" : "Save"}
            </Button>
          </div>
          {titleErr && <p className="mt-1 text-xs text-accent">{titleErr}</p>}
        </section>

        <section>
          <label className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">URL</label>
          <div className="mt-2 flex items-center gap-2">
            <p className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">{video.url}</p>
            <CopyButton text={video.url} label="media URL" />
          </div>
        </section>

        <section>
          <label className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Subtitles</label>
          <div className="mt-2">
            <SubtitlesPanel video={video} health={health} onUpdate={onUpdate} />
          </div>
        </section>
      </div>
    </Modal>
  );
}

function SubtitlesPanel({
  video,
  health,
  onUpdate,
}: {
  video: Video;
  health: VideoHealth | undefined;
  onUpdate: (id: string, patch: { title?: string; subtitles?: Subtitle[] }) => Promise<void>;
}) {
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const addSubtitle = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;
    setBusy(true);
    setError("");
    try {
      const next: Subtitle[] = [...video.subtitles, { id: "", url: trimmed, label: label.trim(), lang: "" }];
      await onUpdate(video.id, { subtitles: next });
      setUrl("");
      setLabel("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setError("");
    try {
      await onUpdate(video.id, { subtitles: video.subtitles.filter((s) => s.id !== id) });
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const saveSubtitle = async (next: Subtitle) => {
    setSavingId(next.id);
    setError("");
    try {
      await onUpdate(video.id, {
        subtitles: video.subtitles.map((subtitle) => (subtitle.id === next.id ? next : subtitle)),
      });
      setEditingId(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="mt-2 space-y-2 border border-border bg-white/[0.02] p-3">
      {video.subtitles.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {video.subtitles.map((s) => (
            <SubtitleRow
              key={s.id}
              subtitle={s}
              health={health?.subtitles?.[s.id]}
              editing={editingId === s.id}
              busy={savingId === s.id}
              onEdit={() => setEditingId(s.id)}
              onCancel={() => setEditingId(null)}
              onSave={saveSubtitle}
              onRemove={() => remove(s.id)}
            />
          ))}
        </ul>
      )}

      <form onSubmit={addSubtitle} className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Subtitle URL (.vtt or .srt)"
          className="h-10 sm:flex-1"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
        />
        <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label (e.g. English)" className="h-10 sm:w-48" />
        <Button type="submit" variant="outline" disabled={!url.trim() || busy} className="h-10 shrink-0">
          <Plus className="h-4 w-4" />
          Add
        </Button>
      </form>

      {error && <p className="text-xs text-accent">{error}</p>}
    </div>
  );
}

function SubtitleRow({
  subtitle,
  health,
  editing,
  busy,
  onEdit,
  onCancel,
  onSave,
  onRemove,
}: {
  subtitle: Subtitle;
  health: VideoHealth["subtitles"][string] | undefined;
  editing: boolean;
  busy: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (subtitle: Subtitle) => Promise<void>;
  onRemove: () => void;
}) {
  const [url, setUrl] = useState(subtitle.url);
  const [label, setLabel] = useState(subtitle.label);
  const dirty = url.trim() !== subtitle.url || label.trim() !== subtitle.label;

  const startEditing = () => {
    setUrl(subtitle.url);
    setLabel(subtitle.label);
    onEdit();
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const nextUrl = url.trim();
    if (!nextUrl || busy) return;
    await onSave({ ...subtitle, url: nextUrl, label: label.trim() });
  };

  if (editing) {
    return (
      <li className="border border-accent/35 bg-accent/[0.045] p-2.5 shadow-[inset_2px_0_0_hsl(var(--accent))]">
        <form onSubmit={submit} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_12rem_auto] sm:items-center">
          <Input
            autoFocus
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="Subtitle URL (.vtt or .srt)"
            aria-label="Subtitle URL"
            className="h-9 min-w-0 font-mono text-xs"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            disabled={busy}
          />
          <Input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Label" aria-label="Subtitle label" className="h-9" disabled={busy} />
          <div className="flex justify-end gap-1">
            <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" variant="accent" size="sm" disabled={!url.trim() || !dirty || busy}>
              {busy ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className="flex items-center gap-2 border border-border bg-bg-elevated/50 px-2.5 py-1.5">
      <HealthDot status={health} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-xs font-medium text-foreground/90">{subtitle.label || subtitle.url}</span>
        </div>
        <p className="truncate font-mono text-[10px] text-text-dim">{subtitle.url}</p>
      </div>
      <button
        type="button"
        onClick={startEditing}
        aria-label={`Edit ${subtitle.label || subtitle.url}`}
        title="Edit subtitle"
        className="shrink-0 p-1 text-muted-foreground transition hover:bg-white/[0.05] hover:text-foreground"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
      <CopyButton text={subtitle.url} label="subtitle URL" />
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${subtitle.label || subtitle.url}`}
        className="shrink-0 p-1 text-muted-foreground transition hover:bg-white/[0.05] hover:text-accent"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}
