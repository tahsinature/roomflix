import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { Subtitle, Video, VideoHealth } from "@shared/protocol";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CopyButton } from "@/components/CopyButton";
import { HealthDot } from "@/components/HealthDot";
import { Modal } from "@/components/Modal";

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

  return (
    <Modal open={open} onClose={onClose} title="Edit video">
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
            <CopyButton text={video.url} label="video URL" />
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
  const [lang, setLang] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const addSubtitle = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;
    setBusy(true);
    setError("");
    try {
      const next: Subtitle[] = [...video.subtitles, { id: "", url: trimmed, label: label.trim(), lang: lang.trim() }];
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
      await onUpdate(video.id, { subtitles: video.subtitles.filter((s) => s.id !== id) });
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="mt-2 space-y-2 border border-border bg-white/[0.02] p-3">
      {video.subtitles.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {video.subtitles.map((s) => (
            <li key={s.id} className="flex items-center gap-2 border border-border bg-bg-elevated/50 px-2.5 py-1.5">
              <HealthDot status={health?.subtitles?.[s.id]} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-xs font-medium text-foreground/90">{s.label || s.url}</span>
                  {s.lang && <span className="border border-cyan/30 bg-cyan/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-cyan">{s.lang}</span>}
                </div>
                <p className="truncate font-mono text-[10px] text-text-dim">{s.url}</p>
              </div>
              <CopyButton text={s.url} label="subtitle URL" />
              <button
                type="button"
                onClick={() => remove(s.id)}
                aria-label={`Remove ${s.label || s.url}`}
                className="shrink-0 p-1 text-muted-foreground transition hover:bg-white/[0.05] hover:text-accent"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={addSubtitle} className="flex flex-col gap-2 sm:flex-row">
        <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Subtitle URL (.vtt or .srt)" className="h-10 sm:flex-1" autoCapitalize="off" autoCorrect="off" spellCheck={false} />
        <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label (e.g. English)" className="h-10 sm:w-40" />
        <Input value={lang} onChange={(e) => setLang(e.target.value)} placeholder="Lang (e.g. en)" className="h-10 sm:w-28" autoCapitalize="off" />
        <Button type="submit" variant="outline" disabled={!url.trim() || busy} className="h-10 shrink-0">
          <Plus className="h-4 w-4" />
          Add
        </Button>
      </form>

      {error && <p className="text-xs text-accent">{error}</p>}
    </div>
  );
}
