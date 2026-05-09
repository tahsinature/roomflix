import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Ban, ListVideo } from "lucide-react";
import type { LibraryHealth, Video } from "@shared/protocol";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { HealthDot } from "@/components/HealthDot";
import { SubtitleBadge } from "@/components/SubtitleBadge";
import { urlIsClearlyNotVideo } from "@/lib/play";
import { cn, urlFilename } from "@/lib/utils";

type Props = {
  onPick: (url: string) => void;
};

export function LibraryPicker({ onPick }: Props) {
  const [open, setOpen] = useState(false);
  const [videos, setVideos] = useState<Video[]>([]);
  const [health, setHealth] = useState<LibraryHealth | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  // Refetch every time the menu opens — picks up videos auto-saved on
  // setUrl by other clients in the room without needing a WS broadcast.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    Promise.all([api.listVideos(), api.libraryHealth().catch(() => null)])
      .then(([list, h]) => {
        if (cancelled) return;
        setVideos(list);
        setHealth(h);
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
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", onEsc);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  const pick = (url: string) => {
    onPick(url);
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <Button type="button" variant="outline" size="sm" aria-label="Library" onClick={() => setOpen((o) => !o)}>
        <ListVideo className="h-3.5 w-3.5" />
        <span className="hidden lg:inline">Library</span>
      </Button>
      {open && (
        // z-50 so the dropdown sits above the player's error/loading overlays
        // (which use z-25 and z-30) when expanded.
        <div className="absolute right-0 top-full z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-white/10 bg-card/95 p-2 shadow-2xl shadow-black/40 backdrop-blur">
          <div className="px-2 pb-2 pt-1 text-xs uppercase tracking-widest text-muted-foreground">Pick from library</div>
          {loading ? (
            <div className="px-3 py-4 text-xs text-muted-foreground">Loading…</div>
          ) : error ? (
            <div className="px-3 py-4 text-xs text-red-300">{error}</div>
          ) : videos.length === 0 ? (
            <div className="px-3 py-4 text-xs text-muted-foreground">Nothing saved yet. Paste a URL to start your library.</div>
          ) : (
            <>
              <ul className="max-h-72 overflow-y-auto">
                {videos.map((v) => {
                  const vh = health?.videos[v.id];
                  const isGone = vh?.video === "gone";
                  const notVideo = urlIsClearlyNotVideo(v.url);
                  const disabled = isGone || notVideo;
                  const reason = isGone ? "URL is unreachable" : notVideo ? "Doesn't look like a video" : undefined;
                  return (
                    <li key={v.id}>
                      <button
                        type="button"
                        disabled={disabled}
                        title={reason}
                        onClick={() => pick(v.url)}
                        className={cn("flex w-full items-start gap-2 rounded-md px-3 py-2 text-left transition", disabled ? "cursor-not-allowed opacity-50" : "hover:bg-white/5")}
                      >
                        {disabled ? (
                          <Ban className="mt-1 h-3 w-3 shrink-0 text-muted-foreground" />
                        ) : (
                          <span className="mt-1.5">
                            <HealthDot status={vh?.video} />
                          </span>
                        )}
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="flex min-w-0 items-center gap-1.5">
                            <span className="truncate text-sm text-foreground">{v.title}</span>
                            <SubtitleBadge subtitles={v.subtitles} health={vh} />
                          </span>
                          <span className="w-full truncate font-mono text-[11px] text-muted-foreground" title={v.url}>
                            {urlFilename(v.url)}
                          </span>
                          {reason && <span className="truncate text-[10px] text-amber-300/80">{reason}</span>}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          <div className="mt-1 border-t border-white/5 pt-1">
            <Link
              to="/library"
              onClick={() => setOpen(false)}
              className="flex items-center justify-between gap-2 rounded-md px-3 py-2 text-xs text-muted-foreground transition hover:bg-white/5 hover:text-foreground"
            >
              <span>Manage library</span>
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
