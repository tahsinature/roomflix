import { useEffect, useRef, useState } from "react";
import { ListVideo } from "lucide-react";
import type { Video } from "@shared/protocol";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";

type Props = {
  onPick: (url: string) => void;
};

export function LibraryPicker({ onPick }: Props) {
  const [open, setOpen] = useState(false);
  const [videos, setVideos] = useState<Video[]>([]);
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
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-label="Library"
        onClick={() => setOpen((o) => !o)}
      >
        <ListVideo className="h-3.5 w-3.5" />
        <span className="hidden lg:inline">Library</span>
      </Button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-white/10 bg-card/95 p-2 shadow-2xl shadow-black/40 backdrop-blur">
          <div className="px-2 pb-2 pt-1 text-xs uppercase tracking-widest text-muted-foreground">
            Pick from library
          </div>
          {loading ? (
            <div className="px-3 py-4 text-xs text-muted-foreground">
              Loading…
            </div>
          ) : error ? (
            <div className="px-3 py-4 text-xs text-red-300">{error}</div>
          ) : videos.length === 0 ? (
            <div className="px-3 py-4 text-xs text-muted-foreground">
              Nothing saved yet. Paste a URL to start your library.
            </div>
          ) : (
            <ul className="max-h-72 overflow-y-auto">
              {videos.map((v) => (
                <li key={v.id}>
                  <button
                    type="button"
                    onClick={() => pick(v.url)}
                    className="flex w-full flex-col items-start gap-0.5 rounded-md px-3 py-2 text-left transition hover:bg-white/5"
                  >
                    <span className="w-full truncate text-sm text-foreground">
                      {v.title}
                    </span>
                    <span className="w-full truncate font-mono text-[11px] text-muted-foreground">
                      {v.url}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
