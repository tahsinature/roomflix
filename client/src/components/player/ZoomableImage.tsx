import { useCallback, useEffect, useRef, useState } from "react";
import { ImageOff, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// A single image with wheel-zoom, double-click-zoom, and drag-to-pan.
// Self-contained — no external zoom library. Zoom state is per-viewer and
// never synced: each person frames their own view of the shared photo.

type Transform = { scale: number; x: number; y: number };
const IDENTITY: Transform = { scale: 1, x: 0, y: 0 };
const MIN_SCALE = 1;
const MAX_SCALE = 6;

// Tri-state load status. "loading" shows a spinner; "loaded" fades the
// image in; "error" swaps to a friendly fallback. Tracking this
// explicitly (vs a single `loaded` flag) gets us a proper error path
// without re-introducing the cached-image blank bug.
type LoadStatus = "loading" | "loaded" | "error";

export function ZoomableImage({ src, alt }: { src: string; alt: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [transform, setTransform] = useState<Transform>(IDENTITY);
  const [status, setStatus] = useState<LoadStatus>("loading");
  // Active pointer-drag (panning). Null when not dragging.
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; origX: number; origY: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  // Reset zoom + status whenever the photo changes. Then guard against
  // the classic "img was already cached" race: if the browser had the
  // image complete BEFORE React attached `onLoad`, the load event was
  // dispatched without us — onLoad won't fire, the photo would sit
  // opacity-0 forever. Inspect `complete` + `naturalWidth` to detect
  // that and flip to "loaded" synchronously.
  useEffect(() => {
    setTransform(IDENTITY);
    const img = imgRef.current;
    if (img && img.complete) {
      setStatus(img.naturalWidth > 0 ? "loaded" : "error");
    } else {
      setStatus("loading");
    }
  }, [src]);

  const loaded = status === "loaded";

  // Clamp a transform: bound the scale, and keep a zoomed image from being
  // panned entirely off-frame. At scale 1 the image is always centered.
  const clamp = useCallback((next: Transform): Transform => {
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next.scale));
    if (scale <= 1) return IDENTITY;
    const el = containerRef.current;
    if (!el) return { ...next, scale };
    const maxX = (el.clientWidth * (scale - 1)) / 2;
    const maxY = (el.clientHeight * (scale - 1)) / 2;
    return {
      scale,
      x: Math.min(maxX, Math.max(-maxX, next.x)),
      y: Math.min(maxY, Math.max(-maxY, next.y)),
    };
  }, []);

  // Zoom by `factor` toward a viewport point — the pixel under the cursor
  // stays put as the image scales.
  const zoomToward = useCallback(
    (clientX: number, clientY: number, factor: number) => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const cx = clientX - rect.left - rect.width / 2;
      const cy = clientY - rect.top - rect.height / 2;
      setTransform((prev) => {
        const nextScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, prev.scale * factor));
        const ratio = nextScale / prev.scale;
        return clamp({
          scale: nextScale,
          x: cx - (cx - prev.x) * ratio,
          y: cy - (cy - prev.y) * ratio,
        });
      });
    },
    [clamp],
  );

  // React attaches `onWheel` passively, so preventDefault there is a no-op.
  // Bind a non-passive listener directly to keep the page from scrolling.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomToward(e.clientX, e.clientY, e.deltaY < 0 ? 1.2 : 1 / 1.2);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomToward]);

  const onDoubleClick = (e: React.MouseEvent) => {
    if (transform.scale > 1) setTransform(IDENTITY);
    else zoomToward(e.clientX, e.clientY, 2.6);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (transform.scale <= 1) return;
    dragRef.current = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, origX: transform.x, origY: transform.y };
    setDragging(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    setTransform((prev) => clamp({ scale: prev.scale, x: d.origX + (e.clientX - d.startX), y: d.origY + (e.clientY - d.startY) }));
  };
  const endDrag = (e: React.PointerEvent) => {
    if (dragRef.current?.pointerId === e.pointerId) {
      dragRef.current = null;
      setDragging(false);
    }
  };

  const zoomed = transform.scale > 1;

  return (
    <div
      ref={containerRef}
      onDoubleClick={onDoubleClick}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      className={cn(
        "relative flex h-full w-full select-none items-center justify-center overflow-hidden touch-none",
        zoomed ? (dragging ? "cursor-grabbing" : "cursor-grab") : "cursor-zoom-in",
      )}
    >
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        draggable={false}
        onLoad={() => setStatus("loaded")}
        onError={() => setStatus("error")}
        className={cn("max-h-full max-w-full object-contain", loaded ? "opacity-100" : "opacity-0")}
        style={{
          transform: `translate3d(${transform.x}px, ${transform.y}px, 0) scale(${transform.scale})`,
          transition: dragging ? "none" : "transform 0.14s ease-out, opacity 0.3s ease-out",
        }}
      />

      {status === "loading" && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <Loader2 className="h-7 w-7 animate-spin text-white/55" />
        </div>
      )}
      {status === "error" && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/55">
          <ImageOff className="h-9 w-9" />
          <span className="font-mono text-xs uppercase tracking-[0.18em]">Couldn't load photo</span>
        </div>
      )}
    </div>
  );
}
