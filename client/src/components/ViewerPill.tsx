import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Circle, ChevronDown, Crown, Pause, Play, User, Users } from "lucide-react";
import type { Participant, PresenceStatus } from "@shared/protocol";
import { MemberDetailModal, type MemberDetailKey } from "@/components/MemberDetailModal";
import { useSessionPresence } from "@/auth/SessionPresence";
import { cn, urlFilename } from "@/lib/utils";

// Presence + now-playing chip for the top nav. Reads everything from
// SessionPresenceContext so call sites just pass `meId` + alignment.
//
// Three states per row, color-coded:
//   watching — emerald dot, on /watch right now
//   online   — cyan dot, app open but not on /watch
//   offline  — muted dot, not connected (only ever shown for members,
//              since guests are transient and disappear on disconnect)
//
// Trigger count is participants.length ("people in this space right
// now"). The play/pause pip lights up when a video is loaded.
export function ViewerPill({
  meId,
  className,
  align = "left",
}: {
  // Optional — when given, the matching row is labeled "you".
  meId?: string | null;
  className?: string;
  // Side of the chip to anchor the dropdown to. Use "right" when the
  // chip sits on the right edge of a nav (so the menu doesn't clip).
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const [selectedDetail, setSelectedDetail] = useState<MemberDetailKey | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const { state, participants, members } = useSessionPresence();

  // Close on a real click outside (mousedown on document, target not
  // inside this chip). Using `blur` previously closed the menu whenever
  // the window lost focus — which broke multi-window testing where you
  // want to keep one window's dropdown open while clicking the other.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const root = rootRef.current;
      if (!root) return;
      if (e.target instanceof Node && !root.contains(e.target)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Per-identity status lookup. Members not in the map are offline.
  const statusById = new Map<string, PresenceStatus>(participants.map((p) => [p.id, p.status]));
  const watchingCount = participants.reduce((n, p) => (p.status === "watching" ? n + 1 : n), 0);
  const onlineCount = participants.length; // total present (watching ∪ online)

  // Lookup participant by identity id — used to enrich row details
  // (volume, tab counts, etc.) without re-finding per render.
  const participantById = new Map<string, Participant>(participants.map((p) => [p.id, p]));

  type Row = {
    id: string;
    name: string;
    username?: string | null;
    sublabel: string;
    role: "owner" | "member" | "guest";
    isOwner: boolean;
    isMe: boolean;
    status: PresenceStatus | "offline";
    tone: "member" | "guest";
    participant?: Participant;
    // For real members only — when they joined the space.
    memberJoinedAt?: number;
  };
  const memberIds = new Set(members.map((m) => m.userId));
  const memberRows: Row[] = members.map((m) => ({
    id: m.userId,
    name: m.displayName?.trim() || `@${m.username}`,
    username: m.username,
    sublabel: m.role === "owner" ? "owner" : "member",
    role: m.role === "owner" ? "owner" : "member",
    isOwner: m.role === "owner",
    isMe: m.userId === meId,
    status: statusById.get(m.userId) ?? "offline",
    tone: "member",
    participant: participantById.get(m.userId),
    memberJoinedAt: m.joinedAt,
  }));
  // Guests are only ever known to us when connected — they don't have
  // DB rows. So a guest only appears when they're a participant.
  const guestRows: Row[] = participants
    .filter((p) => p.kind === "guest" || !memberIds.has(p.id))
    .map((p) => ({
      id: p.id,
      name: p.displayName,
      sublabel: "guest",
      role: "guest",
      isOwner: false,
      isMe: p.id === meId,
      status: p.status,
      tone: "guest",
      participant: p,
    }));

  const rows: Row[] = [...memberRows, ...guestRows].sort((a, b) => {
    // watching → online → offline → owners on top within ties → members
    // before guests within ties → alphabetical.
    const aS = rank(a.status);
    const bS = rank(b.status);
    if (aS !== bS) return aS - bS;
    if (a.isOwner !== b.isOwner) return a.isOwner ? -1 : 1;
    if (a.tone !== b.tone) return a.tone === "member" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  // Show "now playing" visuals only when there's both a loaded video AND
  // someone actually in the player. The session keeps state in memory
  // for ~5min after the last watcher leaves (so a returning user resumes
  // where it was), but flagging that as "active" in the chip is a false
  // alarm — nobody's watching anything.
  const someoneWatching = watchingCount > 0;
  const hasVideo = !!state?.videoUrl && someoneWatching;
  const playing = !!state?.playing;
  const empty = rows.length === 0;

  return (
    <div ref={rootRef} className={cn("relative inline-flex", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={empty}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          "inline-flex h-9 items-center gap-1.5 border px-3 font-mono text-xs transition",
          empty
            ? "cursor-default border-border/60 bg-transparent text-text-dim/70"
            : hasVideo
              ? "cursor-pointer border-accent/40 bg-accent/10 text-foreground hover:bg-accent/15"
              : "cursor-pointer border-border bg-bg-elevated/50 text-foreground hover:bg-bg-elevated/70",
        )}
        title={
          empty
            ? "Nobody is in this space right now"
            : `${onlineCount} in space${watchingCount > 0 ? ` · ${watchingCount} watching` : ""}`
        }
      >
        <Users className={cn("h-3 w-3", onlineCount === 0 ? "text-text-dim/70" : "text-accent")} />
        <span className={cn("tabular-nums", onlineCount === 0 ? "text-text-dim/80" : "text-foreground")}>{onlineCount}</span>
        {hasVideo && (
          // Tiny pip in the closed chip. Animated bars when playing —
          // unambiguous "this is happening now"; pause icon when paused.
          <span className="flex h-3 w-3 items-center justify-center text-accent" aria-label={playing ? "playing" : "paused"}>
            {playing ? <PlayingBars className="h-2.5 w-2.5" /> : <Pause className="h-2.5 w-2.5 fill-current" />}
          </span>
        )}
        {!empty && <ChevronDown className={cn("h-3 w-3 text-text-dim transition", open && "rotate-180")} />}
        {empty && <span className="hidden sm:inline">online</span>}
      </button>

      {open && !empty && (
        <div
          className={cn(
            "absolute top-10 z-40 min-w-[16rem] border border-border bg-bg-elevated/95 shadow-[0_12px_32px_-12px_rgba(0,0,0,0.7)] backdrop-blur-xl",
            align === "right" ? "right-0" : "left-0",
          )}
          role="menu"
        >
          {hasVideo && state && (
            <NowPlayingHeader
              title={state.videoTitle || urlFilename(state.videoUrl!)}
              playing={playing}
              imHere={meId !== null && statusById.get(meId ?? "") === "watching"}
              onClose={() => setOpen(false)}
            />
          )}
          <ul className="max-h-80 overflow-y-auto">
            {rows.map((r) => (
              <MemberRow
                key={r.id}
                name={r.name}
                sublabel={r.sublabel}
                isOwner={r.isOwner}
                isMe={r.isMe}
                status={r.status}
                tone={r.tone}
                playing={playing}
                onClick={() => {
                  setOpen(false);
                  setSelectedDetail({
                    identityId: r.id,
                    role: r.role,
                    name: r.name,
                    username: r.username,
                    isMe: r.isMe,
                    memberJoinedAt: r.memberJoinedAt,
                  });
                }}
              />
            ))}
          </ul>
        </div>
      )}
      <MemberDetailModal detail={selectedDetail} onClose={() => setSelectedDetail(null)} />
    </div>
  );
}

function rank(s: PresenceStatus | "offline"): number {
  if (s === "watching") return 0;
  if (s === "online") return 1;
  return 2;
}

function NowPlayingHeader({
  title,
  playing,
  imHere,
  onClose,
}: {
  title: string;
  playing: boolean;
  imHere: boolean;
  onClose: () => void;
}) {
  const stateLabel = playing ? "Playing now" : "Paused";
  const sublabel = imHere ? `${stateLabel} · you're watching` : `${stateLabel} · tap to join`;

  const body = (
    <>
      <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center border border-accent/40 bg-accent/15 text-accent">
        {playing ? <PlayingBars className="h-3 w-3" /> : <Play className="h-3 w-3 fill-current" />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm text-foreground">{title}</div>
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-dim">{sublabel}</div>
      </div>
    </>
  );

  if (imHere) {
    return (
      <div className="flex items-center gap-2.5 border-b border-border bg-accent/10 px-3 py-2" title={stateLabel}>
        {body}
      </div>
    );
  }

  return (
    <Link
      to="/watch"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClose}
      className="flex items-center gap-2.5 border-b border-border bg-accent/10 px-3 py-2 transition hover:bg-accent/15"
      title={`${stateLabel} — click to open the player`}
    >
      {body}
    </Link>
  );
}

function MemberRow({
  name,
  sublabel,
  isOwner,
  isMe,
  status,
  tone,
  playing,
  onClick,
}: {
  name: string;
  sublabel: string;
  isOwner: boolean;
  isMe: boolean;
  status: PresenceStatus | "offline";
  tone: "member" | "guest";
  // Current playback state of the space's session.
  playing: boolean;
  // Open the detail modal for this identity.
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={onClick}
        className="flex w-full items-center gap-3 px-3 py-2 text-left transition hover:bg-white/[0.04]"
        title="See details"
      >
        <span
          className={cn(
            "inline-flex h-7 w-7 shrink-0 items-center justify-center border",
            tone === "guest"
              ? "border-amber-300/30 bg-amber-300/10 text-amber-200"
              : "border-accent/30 bg-accent/10 text-accent",
          )}
        >
          {isOwner ? <Crown className="h-3.5 w-3.5" /> : <User className="h-3.5 w-3.5" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={cn("truncate text-sm text-foreground", tone === "guest" && "italic")}>{name}</span>
            {isMe && <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-dim">you</span>}
          </div>
          <div className="font-mono text-[11px] text-text-dim">{sublabel}</div>
        </div>
        <StatusBadge status={status} playing={playing} />
      </button>
    </li>
  );
}

// Three animated bars in a "now playing" rhythm. Used in place of the
// static play icon whenever the space's video is actually playing —
// distinguishes "video is live right now" from "tap to play it."
// Sized to fit wherever a small lucide icon would (h-2.5 / h-3, etc.)
// via standard width/height utility classes.
function PlayingBars({ className }: { className?: string }) {
  return (
    <span
      className={cn("inline-flex h-full w-full items-end justify-center gap-[1.5px]", className)}
      aria-hidden
    >
      <span className="eq-bar h-full w-[2px]" />
      <span className="eq-bar h-full w-[2px]" />
      <span className="eq-bar h-full w-[2px]" />
    </span>
  );
}

// Status indicator on each row. The "watching" presence splits into two
// labels depending on whether the video is actually playing:
//   - playing  → "Watching" with a play icon, bright emerald
//   - paused / no video → "Joined" with a pause icon, dim emerald
// Saying "Watching" while everyone's paused was misleading — nobody is
// actually watching anything. "Joined" reads as "in the player with you,
// waiting" which matches reality.
function StatusBadge({ status, playing }: { status: PresenceStatus | "offline"; playing: boolean }) {
  if (status === "watching") {
    if (playing) {
      return (
        <span
          className="inline-flex shrink-0 items-center gap-1 border border-emerald-400/40 bg-emerald-400/10 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-emerald-300"
          title="In the player, watching the playing video"
        >
          <Play className="h-2.5 w-2.5 fill-current" />
          Watching
        </span>
      );
    }
    return (
      <span
        className="inline-flex shrink-0 items-center gap-1 border border-emerald-400/30 bg-emerald-400/[0.06] px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-emerald-300/80"
        title="In the player with you — video is paused or not loaded yet"
      >
        <Pause className="h-2.5 w-2.5 fill-current" />
        Joined
      </span>
    );
  }
  if (status === "online") {
    return (
      <span
        className="inline-flex shrink-0 items-center gap-1 border border-cyan-400/40 bg-cyan-400/10 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-cyan-300"
        title="App open, not on the watch page"
      >
        <Circle className="h-2 w-2 fill-current" />
        Online
      </span>
    );
  }
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 border border-border/60 bg-transparent px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-text-dim/70"
      title="Not connected"
    >
      Offline
    </span>
  );
}
