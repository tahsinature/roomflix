import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { Ban, ChevronDown, Play, Users } from "lucide-react";
import type { RoomListItem, Video, VideoHealth } from "@shared/protocol";
import { Button } from "@/components/ui/button";
import { findActiveRoomsFor, pathForNewRoomPlaying, urlIsClearlyNotVideo } from "@/lib/play";
import { cn } from "@/lib/utils";

type Props = {
  video: Pick<Video, "url">;
  rooms: RoomListItem[];
  // When defined and `health.video === "gone"`, the button disables itself.
  // Undefined or "ok"/"unverified" lets the click through.
  health?: VideoHealth;
  size?: "sm" | "default";
};

// Smart play behavior:
//   • No room playing this URL → "Play" (creates a fresh room)
//   • One room → "Join · N" (direct navigate)
//   • Multiple rooms → opens a picker so the user can choose
export function PlayButton({ video, rooms, health, size = "sm" }: Props) {
  const navigate = useNavigate();
  const matching = findActiveRoomsFor(video.url, rooms);
  const isGone = health?.video === "gone";
  const notVideo = urlIsClearlyNotVideo(video.url);

  if (isGone || notVideo) {
    return (
      <Button variant="outline" size={size} disabled title={isGone ? "URL is unreachable. Verify it on the library page." : "This URL doesn't look like a video file."}>
        <Ban className="h-3.5 w-3.5" />
        {isGone ? "Unavailable" : "Not a video"}
      </Button>
    );
  }

  // No matches → spawn a new room.
  if (matching.length === 0) {
    return (
      <Button variant="accent" size={size} onClick={() => navigate(pathForNewRoomPlaying(video.url))}>
        <Play className="h-3.5 w-3.5 fill-current" />
        Play
      </Button>
    );
  }

  // Single match → direct join.
  if (matching.length === 1) {
    const room = matching[0]!;
    return (
      <Button variant="accent" size={size} onClick={() => navigate(`/room/${encodeURIComponent(room.id)}`)}>
        <Users className="h-3.5 w-3.5" />
        Join · {room.viewers}
      </Button>
    );
  }

  // Multiple matches → show a picker.
  return <RoomPickerButton rooms={matching} size={size} />;
}

function RoomPickerButton({ rooms, size }: { rooms: RoomListItem[]; size: "sm" | "default" }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  // The popover is portaled to <body> so it escapes any surrounding stacking
  // contexts and overflow-clipped ancestors. We track the trigger's screen
  // position to anchor the floating popover next to it.
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    const reposition = () => {
      const el = triggerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setPos({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
    };
    reposition();
    // Reposition on viewport changes; capture-phase scroll catches scroll
    // events from any ancestor container, not just window.
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || popoverRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onEsc);
    return () => {
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  return (
    <>
      <Button ref={triggerRef} variant="accent" size={size} onClick={() => setOpen((o) => !o)}>
        <Users className="h-3.5 w-3.5" />
        Join · {rooms.length} rooms
        <ChevronDown className={cn("h-3 w-3 opacity-80 transition-transform", open && "rotate-180")} />
      </Button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={popoverRef}
            style={{ position: "fixed", top: pos.top, right: pos.right, zIndex: 100 }}
            className="min-w-[16rem] border border-border bg-bg-elevated p-1 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.7)]"
          >
            <div className="px-3 pb-1.5 pt-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Pick a room</div>
            {rooms.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => {
                  navigate(`/room/${encodeURIComponent(r.id)}`);
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition hover:bg-white/[0.04]"
              >
                <span className="font-mono text-sm text-foreground">#{r.id}</span>
                <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span>
                    {r.viewers} {r.viewers === 1 ? "viewer" : "viewers"}
                  </span>
                  <span className="text-text-dim">· {timeAgo(r.updatedAt)}</span>
                </span>
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}

function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
