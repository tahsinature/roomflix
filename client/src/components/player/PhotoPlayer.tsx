import { ChevronLeft, ChevronRight, ImageOff } from "lucide-react";
import { cn, urlFilename } from "@/lib/utils";
import { ZoomableImage } from "./ZoomableImage";

type Props = {
  // Current photo URL. Null renders an empty frame (e.g. an empty album).
  url: string | null;
  title?: string | null;
  // 0-based index within the album and the album's length. `total <= 1`
  // hides the prev/next affordances (a standalone image has no neighbors).
  index: number;
  total: number;
  onNext: () => void;
  onPrev: () => void;
};

// The synced photo surface. Renders the current album photo edge-to-edge
// with per-viewer zoom/pan; prev/next move the synced index for everyone.
// Reveal-on-hover chevrons keep the frame clean when the photo is idle.
export function PhotoPlayer({ url, title, index: _index, total, onNext, onPrev }: Props) {
  const hasNav = total > 1;

  if (!url) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-black text-white/50">
        <ImageOff className="h-8 w-8" />
        <span className="font-mono text-xs uppercase tracking-[0.18em]">No photo</span>
      </div>
    );
  }

  return (
    <div className="group relative flex h-full w-full items-center justify-center overflow-hidden bg-black">
      {/* `key` forces a fresh ZoomableImage per photo so zoom/pan resets. */}
      <ZoomableImage key={url} src={url} alt={title?.trim() || urlFilename(url)} />

      {hasNav && (
        <>
          <NavArrow side="left" onClick={onPrev} />
          <NavArrow side="right" onClick={onNext} />
        </>
      )}
    </div>
  );
}

function NavArrow({ side, onClick }: { side: "left" | "right"; onClick: () => void }) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === "left" ? "Previous photo" : "Next photo"}
      className={cn(
        "absolute top-1/2 z-20 flex h-12 w-12 -translate-y-1/2 items-center justify-center border border-white/15 bg-black/50 text-white/85 opacity-0 backdrop-blur transition hover:bg-black/70 hover:text-white focus-visible:opacity-100 group-hover:opacity-100",
        side === "left" ? "left-3 sm:left-5" : "right-3 sm:right-5",
      )}
    >
      <Icon className="h-6 w-6" />
    </button>
  );
}
