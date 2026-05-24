import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, Film, ImageIcon, Loader2, Music, PlayCircle, Trash2 } from "lucide-react";
import type { WatchHistoryEntry } from "@shared/protocol";
import { api } from "@/lib/api";
import { useAuth } from "@/auth/AuthContext";
import { useToast } from "@/components/Toast";
import { cn, mediaKind, urlFilename } from "@/lib/utils";

// Per-space watch-history timeline. Newest first, day-grouped. Each
// row shows where the room got to (lastPosition / duration), a small
// kind glyph (or image thumb), and a "play" affordance that re-loads
// the URL into the live session via the deep-link path.
export default function History() {
  const { currentSpace } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [entries, setEntries] = useState<WatchHistoryEntry[] | null>(null);
  const [error, setError] = useState("");
  // Two-step clear so a fat-finger doesn't nuke the timeline. The
  // second click within ~4s commits.
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const canClear = currentSpace?.role === "owner";

  useEffect(() => {
    if (!currentSpace) return;
    let cancelled = false;
    api
      .watchHistory(currentSpace.id, 200)
      .then((rows) => {
        if (!cancelled) setEntries(rows);
      })
      .catch((e) => {
        if (!cancelled) setError((e as Error).message || "Couldn't load history");
      });
    return () => {
      cancelled = true;
    };
  }, [currentSpace?.id]);

  // Group rows by day for a calmer timeline.
  const grouped = useMemo(() => groupByDay(entries ?? []), [entries]);

  // Auto-cancel the confirm prompt after a short window so the button
  // doesn't sit in "Confirm?" state indefinitely.
  useEffect(() => {
    if (!confirmingClear) return;
    const t = setTimeout(() => setConfirmingClear(false), 4000);
    return () => clearTimeout(t);
  }, [confirmingClear]);

  const clearHistory = async () => {
    if (!currentSpace) return;
    setClearing(true);
    try {
      const { deleted } = await api.clearWatchHistory(currentSpace.id);
      setEntries([]);
      setConfirmingClear(false);
      toast.success(deleted > 0 ? `Cleared ${deleted} item${deleted === 1 ? "" : "s"} from history.` : "History was already empty.");
    } catch (err) {
      toast.error(`Couldn't clear history. ${(err as Error).message}`);
    } finally {
      setClearing(false);
    }
  };

  if (!currentSpace) {
    return (
      <main className="mx-auto flex min-h-[60vh] max-w-2xl items-center justify-center px-6 text-center">
        <p className="text-sm text-muted-foreground">Join a space to see its watch history.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-5 py-8 sm:px-6 sm:py-12">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-muted-foreground">History</p>
          <h1 className="mt-1.5 text-balance text-2xl font-medium tracking-tight text-foreground sm:text-3xl">
            What <span className="text-accent">{currentSpace.name}</span> has been watching
          </h1>
        </div>
        {canClear && entries && entries.length > 0 && (
          <button
            type="button"
            onClick={() => {
              if (confirmingClear) clearHistory();
              else setConfirmingClear(true);
            }}
            disabled={clearing}
            aria-label={confirmingClear ? "Confirm clear history" : "Clear history"}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 border px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.16em] transition disabled:opacity-50",
              confirmingClear
                ? "border-accent bg-accent/15 text-accent hover:bg-accent/20"
                : "border-border bg-bg-elevated/40 text-muted-foreground hover:border-accent/40 hover:text-foreground",
            )}
          >
            {clearing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
            {confirmingClear ? "Click again to confirm" : "Clear history"}
          </button>
        )}
      </header>

      {error && <div className="border border-accent/40 bg-accent/10 px-3 py-2 text-sm text-foreground">{error}</div>}
      {!entries && !error && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading…
        </div>
      )}
      {entries && entries.length === 0 && <p className="text-sm text-muted-foreground">Nothing here yet. Anything the room watches will show up.</p>}

      <div className="flex flex-col gap-8">
        {grouped.map(({ day, rows }) => (
          <section key={day}>
            <h2 className="mb-2 font-mono text-[11px] uppercase tracking-[0.22em] text-text-dim">{day}</h2>
            <ul className="flex flex-col">
              {rows.map((entry) => (
                <li key={entry.id}>
                  <HistoryRow entry={entry} onPlay={() => navigate(`/watch?video=${encodeURIComponent(entry.videoUrl)}`)} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </main>
  );
}

function HistoryRow({ entry, onPlay }: { entry: WatchHistoryEntry; onPlay: () => void }) {
  const kind = mediaKind(entry.videoUrl);
  const title = entry.videoTitle?.trim() || urlFilename(entry.videoUrl) || "Untitled";
  const progressPct = entry.duration && entry.duration > 0 ? Math.min(100, Math.round((entry.lastPosition / entry.duration) * 100)) : 0;

  return (
    <div className="group flex items-center gap-3 border-b border-white/[0.06] py-3 last:border-b-0">
      {/* Thumb: real image for photos, kind glyph otherwise. */}
      <div className="relative h-14 w-20 shrink-0 overflow-hidden border border-white/10 bg-bg-elevated/30">
        {kind === "image" ? (
          <img src={entry.videoUrl} alt="" loading="lazy" className="h-full w-full object-cover" onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")} />
        ) : null}
        <div className="absolute inset-0 flex items-center justify-center text-white/55">
          <KindIcon kind={kind} />
        </div>
        {entry.completed && (
          <span title="Watched to the end" className="absolute right-1 top-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500/85 text-black">
            <Check className="h-2.5 w-2.5" />
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <p className="truncate text-sm text-foreground" title={title}>
            {title}
          </p>
          <span className="shrink-0 font-mono text-[10px] text-text-dim">{relativeTime(entry.startedAt)}</span>
        </div>
        <div className="mt-0.5 flex items-center gap-2 font-mono text-[10px] text-text-dim">
          {entry.collectionTitle && (
            <span className="truncate" title={entry.collectionTitle}>
              {entry.collectionTitle}
              {entry.collectionIndex !== null ? ` · ${entry.collectionIndex + 1}` : ""}
            </span>
          )}
          {entry.duration && entry.duration > 0 && (
            <span className="shrink-0">
              {formatHMS(entry.lastPosition)} / {formatHMS(entry.duration)}
            </span>
          )}
        </div>
        {entry.duration && entry.duration > 0 && (
          <div className="mt-1.5 h-0.5 w-full overflow-hidden bg-white/[0.06]">
            <div className={cn("h-full", entry.completed ? "bg-emerald-400/60" : "bg-accent/70")} style={{ width: `${progressPct}%` }} />
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={onPlay}
        aria-label={`Play ${title}`}
        title="Play in the theater"
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center border border-border bg-bg-elevated/50 text-muted-foreground transition hover:border-accent/40 hover:text-accent"
      >
        <PlayCircle className="h-4 w-4" />
      </button>
    </div>
  );
}

function KindIcon({ kind }: { kind: ReturnType<typeof mediaKind> }) {
  if (kind === "audio") return <Music className="h-4 w-4" />;
  if (kind === "image") return <ImageIcon className="h-4 w-4" />;
  return <Film className="h-4 w-4" />;
}

function groupByDay(rows: WatchHistoryEntry[]): { day: string; rows: WatchHistoryEntry[] }[] {
  const groups = new Map<string, WatchHistoryEntry[]>();
  for (const r of rows) {
    const key = dayKey(r.startedAt);
    const bucket = groups.get(key);
    if (bucket) bucket.push(r);
    else groups.set(key, [r]);
  }
  return Array.from(groups.entries()).map(([day, rs]) => ({ day, rows: rs }));
}

function dayKey(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  if (sameDay(d, now)) return "Today";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(d, yesterday)) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric", year: d.getFullYear() === now.getFullYear() ? undefined : "numeric" });
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "just now";
  if (diff < 60 * 60_000) return `${Math.round(diff / 60_000)}m ago`;
  if (diff < 24 * 60 * 60_000) return `${Math.round(diff / 3_600_000)}h ago`;
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatHMS(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}
