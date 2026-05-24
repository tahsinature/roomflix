import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Clock, FastForward, Loader2, Pause, Play, Repeat, Rewind, SkipBack, SkipForward, Tv } from "lucide-react";
import type { ChatMessage, ChatMoment, SessionState } from "@shared/protocol";
import { useAuth } from "@/auth/AuthContext";
import { useSessionPresence } from "@/auth/SessionPresence";
import { api } from "@/lib/api";
import { ReactionBar } from "@/components/theater/ReactionBar";
import { cn, mediaKind, urlFilename } from "@/lib/utils";

// Companion screen — open this on a phone (or any second device you're
// signed into) to chat with the room and run the playback remotely while
// the main display stays on /watch. Talks to the same WS session as
// /watch; doesn't flip presence to "watching" so it's invisible to the
// viewer count.
export default function Remote() {
  const { currentSpace, user, guest } = useAuth();
  const { state, viewers, serverTime, send, subscribeChat } = useSessionPresence();
  const navigate = useNavigate();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const threadRef = useRef<HTMLDivElement>(null);
  // Server clock skew — used by ±10s skip to compute the room's expected
  // playback time without a live player here.
  const skewRef = useRef(0);
  useEffect(() => {
    skewRef.current = Date.now() - serverTime;
  }, [serverTime]);

  // History backfill on mount + when the active space changes.
  useEffect(() => {
    if (!currentSpace) {
      setMessages([]);
      setLoadingHistory(false);
      return;
    }
    let cancelled = false;
    setLoadingHistory(true);
    api
      .chatHistory(currentSpace.id)
      .then((msgs) => {
        if (!cancelled) setMessages(msgs);
      })
      .catch(() => {
        /* live subscription will still work; history is best-effort */
      })
      .finally(() => {
        if (!cancelled) setLoadingHistory(false);
      });
    return () => {
      cancelled = true;
    };
  }, [currentSpace?.id]);

  // Live tail — append any chat row the WS broadcasts, dedupe in case
  // the same id arrives twice across reconnects.
  useEffect(() => {
    return subscribeChat((msg) => {
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
    });
  }, [subscribeChat]);

  // Duration probe — when the room has a media URL but the session
  // state still doesn't carry a duration (no /watch open, or its
  // metadata hasn't arrived yet), spin up a throwaway <audio>/<video>
  // element with preload="metadata" just to read the duration off the
  // header. Range requests mean only the metadata bytes get fetched,
  // not the full media. Posts the result back via setDuration so every
  // other client (and the remote itself) gets a scrubable progress bar.
  useEffect(() => {
    const url = state?.videoUrl ?? null;
    if (!url) return;
    if (state?.duration && state.duration > 0) return;
    const kind = mediaKind(url);
    if (kind === "image") return;
    const el = kind === "audio" ? new Audio() : document.createElement("video");
    el.preload = "metadata";
    el.muted = true;
    const handleLoaded = () => {
      const d = el.duration;
      if (Number.isFinite(d) && d > 0) send({ type: "setDuration", duration: d });
      cleanup();
    };
    const handleError = () => cleanup();
    const cleanup = () => {
      el.removeEventListener("loadedmetadata", handleLoaded);
      el.removeEventListener("error", handleError);
      el.removeAttribute("src");
      try {
        el.load();
      } catch {
        /* ignore — element being torn down */
      }
    };
    el.addEventListener("loadedmetadata", handleLoaded);
    el.addEventListener("error", handleError);
    el.src = url;
    return cleanup;
  }, [state?.videoUrl, state?.duration, send]);

  // Auto-scroll to bottom when a new message arrives. Only sticks if the
  // user is already near the bottom — leaves a mid-scroll reader alone.
  useEffect(() => {
    const el = threadRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - (el.scrollTop + el.clientHeight) < 80;
    if (nearBottom) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const expectedTime = (): number => {
    if (!state) return 0;
    if (!state.playing) return state.currentTime;
    const serverNow = Date.now() - skewRef.current;
    return state.currentTime + Math.max(0, (serverNow - state.updatedAt) / 1000);
  };

  // Captured "scene" pin — same shape as on /watch, just sourced from
  // the room's currently-playing item (we have no live player here).
  const [attachedMoment, setAttachedMoment] = useState<ChatMoment | null>(null);
  const captureMoment = useCallback((): ChatMoment | null => {
    if (!state?.videoUrl) return null;
    const serverNow = Date.now() - skewRef.current;
    const expected = state.playing ? state.currentTime + Math.max(0, (serverNow - state.updatedAt) / 1000) : state.currentTime;
    return {
      videoUrl: state.videoUrl,
      currentTime: Math.max(0, expected),
      mediaTitle: state.videoTitle ?? urlFilename(state.videoUrl) ?? "Scene",
      collectionId: state.collectionId,
      collectionIndex: state.collectionId ? state.collectionIndex : null,
    };
  }, [state?.videoUrl, state?.videoTitle, state?.playing, state?.currentTime, state?.updatedAt, state?.collectionId, state?.collectionIndex]);

  const togglePlay = () => {
    if (!state?.videoUrl) return;
    send(state.playing ? { type: "pause" } : { type: "play" });
  };
  const skip = (delta: number) => {
    if (!state?.videoUrl) return;
    send({ type: "seek", currentTime: Math.max(0, expectedTime() + delta) });
  };
  const next = () => state?.collectionId && send({ type: "collectionNext" });
  const prev = () => state?.collectionId && send({ type: "collectionPrev" });
  const toggleLoop = () => state?.collectionId && send({ type: "setCollectionLoop", loop: !state.collectionLoop });

  const sendMessage = (content: { kind: "emoji"; emoji: string } | { kind: "text"; text: string }) => {
    if (content.kind === "text") {
      send(attachedMoment ? { type: "chat", text: content.text, moment: attachedMoment } : { type: "chat", text: content.text });
      setAttachedMoment(null);
    } else {
      send({ type: "reaction", reaction: content });
    }
  };
  // Two effects in one tap: nudge the room to the captured spot, and
  // hop this device into the theater so the user actually lands in the
  // player after the seek. Without the nav, the chip silently moves
  // the room on whatever device has /watch open and the remote sees
  // no feedback at all — confusing if you're testing on a single
  // device or the only listener.
  const jumpToMoment = (moment: ChatMoment) => {
    send({ type: "jumpTo", moment });
    navigate("/watch");
  };

  const meId = user?.id ?? guest?.id ?? "";
  const playingTitle = state?.videoUrl ? state.videoTitle || urlFilename(state.videoUrl) : null;
  const hasMedia = Boolean(state?.videoUrl);
  const hasCollection = Boolean(state?.collectionId);

  if (!currentSpace) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center px-6 text-center">
        <p className="text-sm text-muted-foreground">Join a space to use the remote.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex h-[calc(100dvh-4.5rem)] max-w-xl flex-col">
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Remote · {currentSpace.name}</p>
          <p className="mt-0.5 truncate text-sm text-foreground">{playingTitle ? `${viewers.length} watching · ${playingTitle}` : "Nothing playing"}</p>
        </div>
        <Link
          to="/watch"
          className="inline-flex shrink-0 items-center gap-1.5 border border-border bg-bg-elevated/50 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground transition hover:border-accent/40 hover:text-foreground"
          title="Open theater on this device"
        >
          <Tv className="h-3.5 w-3.5" />
          Open here
        </Link>
      </header>

      <div ref={threadRef} className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {loadingHistory ? (
          <div className="flex h-full items-center justify-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading chat…
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full items-center justify-center px-6 text-center text-xs text-muted-foreground">
            <div>
              <p>No messages yet.</p>
              <p className="mt-1 text-text-dim">Say hi 👋</p>
            </div>
          </div>
        ) : (
          <ul className="flex flex-col px-4 py-3">
            {messages.map((msg, i) => {
              // Group consecutive messages from the same sender within 5min —
              // the per-row header only renders for the first in a run.
              const prevMsg = messages[i - 1];
              const sameSender = prevMsg !== undefined && prevMsg.senderId === msg.senderId && msg.sentAt - prevMsg.sentAt < 5 * 60_000;
              const mine = msg.senderId === meId;
              return (
                <li key={msg.id} className={cn("flex flex-col gap-0.5", sameSender ? "mt-0.5" : "mt-3 first:mt-0")}>
                  {!sameSender && (
                    <div className="flex items-baseline gap-2">
                      <span className={cn("font-mono text-[11px]", mine ? "text-accent" : "text-foreground")}>{msg.senderName}</span>
                      <span className="font-mono text-[10px] text-text-dim">{relativeTime(msg.sentAt)}</span>
                    </div>
                  )}
                  {msg.text && <p className="break-words text-sm text-foreground/95">{msg.text}</p>}
                  {msg.moment && (
                    <button
                      type="button"
                      onClick={() => jumpToMoment(msg.moment!)}
                      className="mt-0.5 inline-flex w-fit items-center gap-1.5 border border-accent/40 bg-accent/[0.06] px-2 py-1 text-[11px] text-accent transition hover:border-accent/70 hover:bg-accent/10 active:bg-accent/15"
                      title="Jump the room to this scene"
                    >
                      <Clock className="h-3 w-3 shrink-0" />
                      <span className="max-w-[220px] truncate">{msg.moment.mediaTitle || "Scene"}</span>
                      {msg.moment.currentTime > 0.5 && <span className="font-mono text-[10px] text-accent/80">{formatMomentTime(msg.moment.currentTime)}</span>}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <ReactionBar
        onSend={sendMessage}
        attachedMoment={attachedMoment}
        onAttachMoment={() => setAttachedMoment(captureMoment())}
        onClearMoment={() => setAttachedMoment(null)}
      />

      {hasMedia && (
        <ProgressIndicator
          state={state!}
          skewRef={skewRef}
          onSeek={(t) => send({ type: "seek", currentTime: Math.max(0, t) })}
        />
      )}

      <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border bg-black/30 px-3 py-3 backdrop-blur sm:px-4 sm:py-4">
        <ControlButton onClick={prev} disabled={!hasCollection} aria-label="Previous item">
          <SkipBack className="h-4 w-4" />
        </ControlButton>
        <ControlButton onClick={() => skip(-10)} disabled={!hasMedia} aria-label="Skip back 10 seconds">
          <Rewind className="h-4 w-4" />
        </ControlButton>
        <button
          type="button"
          onClick={togglePlay}
          disabled={!hasMedia}
          aria-label={state?.playing ? "Pause" : "Play"}
          className="flex h-14 w-14 items-center justify-center border border-accent/60 bg-accent text-accent-foreground transition hover:bg-accent-bright disabled:cursor-not-allowed disabled:opacity-40"
        >
          {state?.playing ? <Pause className="h-6 w-6 fill-current" /> : <Play className="h-6 w-6 fill-current" />}
        </button>
        <ControlButton onClick={() => skip(10)} disabled={!hasMedia} aria-label="Skip forward 10 seconds">
          <FastForward className="h-4 w-4" />
        </ControlButton>
        <ControlButton onClick={next} disabled={!hasCollection} aria-label="Next item">
          <SkipForward className="h-4 w-4" />
        </ControlButton>
        <ControlButton
          onClick={toggleLoop}
          disabled={!hasCollection}
          aria-label={state?.collectionLoop ? "Disable loop" : "Enable loop"}
          title={state?.collectionLoop ? "Loop is on" : "Loop is off"}
          active={state?.collectionLoop ?? false}
        >
          <Repeat className="h-4 w-4" />
        </ControlButton>
      </div>
    </main>
  );
}

// Tap + drag scrubber. Click anywhere on the rail to seek there; drag
// the thumb (or anywhere along the rail) to scrub. Pointer capture
// keeps tracking when the finger drifts off the rail mid-drag. Re-
// renders at 4 Hz while the room is playing so the unfilled state ticks
// smoothly; idle when paused. Photos (no timeline) and not-yet-loaded
// metadata render the rail as a disabled placeholder with em-dashes.
function ProgressIndicator({
  state,
  skewRef,
  onSeek,
}: {
  state: SessionState;
  skewRef: React.MutableRefObject<number>;
  onSeek: (currentTime: number) => void;
}) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!state.playing) return;
    const t = setInterval(() => setTick((n) => n + 1), 250);
    return () => clearInterval(t);
  }, [state.playing]);

  // Live elapsed position derived from state + clock skew.
  const elapsed = state.playing ? state.currentTime + Math.max(0, (Date.now() - skewRef.current - state.updatedAt) / 1000) : state.currentTime;
  const total = state.duration && state.duration > 0 ? state.duration : null;
  const canScrub = total !== null;

  // While a pointer is down on the rail, `dragPct` overrides the live
  // position so the thumb tracks the finger immediately without waiting
  // for the seek to round-trip the server.
  const [dragPct, setDragPct] = useState<number | null>(null);
  const railRef = useRef<HTMLDivElement>(null);

  const pctFromClientX = (clientX: number): number => {
    const rail = railRef.current;
    if (!rail) return 0;
    const r = rail.getBoundingClientRect();
    if (r.width <= 0) return 0;
    return Math.max(0, Math.min(1, (clientX - r.left) / r.width));
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!canScrub) return;
    // Pointer capture so the rail keeps getting move/up events even if
    // the finger drifts off it (or off-screen on phone).
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragPct(pctFromClientX(e.clientX));
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragPct === null) return;
    setDragPct(pctFromClientX(e.clientX));
  };
  const commit = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragPct === null || !total) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* capture may already be released */
    }
    onSeek(dragPct * total);
    setDragPct(null);
  };

  const displayPct = dragPct !== null ? dragPct * 100 : total ? Math.min(100, Math.max(0, (elapsed / total) * 100)) : 0;
  const displayTime = dragPct !== null && total ? dragPct * total : Math.min(elapsed, total ?? elapsed);
  const dragging = dragPct !== null;

  return (
    <div className="flex flex-col gap-1.5 border-t border-border bg-black/20 px-4 py-3">
      <div
        ref={railRef}
        role="slider"
        tabIndex={canScrub ? 0 : -1}
        aria-valuemin={0}
        aria-valuemax={total ?? 0}
        aria-valuenow={Math.round(displayTime)}
        aria-label="Playback position"
        aria-disabled={!canScrub}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={commit}
        onPointerCancel={commit}
        className={cn(
          "relative h-1 w-full select-none touch-none",
          canScrub ? "cursor-pointer" : "cursor-not-allowed opacity-50",
        )}
        style={{ touchAction: "none" }}
      >
        {/* Expanded hit area for fingers — purely a touch target, doesn't
            change the visible rail height. */}
        <span className="pointer-events-none absolute -inset-y-3 inset-x-0" aria-hidden />
        {/* Background rail. */}
        <span className="pointer-events-none absolute inset-0 bg-white/[0.06]" aria-hidden />
        {/* Played-fill. Smooth tween during normal tick, instant while
            dragging so the thumb follows the finger 1:1. */}
        <span
          className={cn("pointer-events-none absolute inset-y-0 left-0 bg-accent", !dragging && "transition-[width] duration-200 ease-linear")}
          style={{ width: `${displayPct}%` }}
          aria-hidden
        />
        {canScrub && (
          <span
            className={cn(
              "pointer-events-none absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent shadow-[0_0_0_3px_rgba(0,0,0,0.5)] transition-transform",
              dragging && "scale-125",
            )}
            style={{ left: `${displayPct}%` }}
            aria-hidden
          />
        )}
      </div>
      <div className="flex justify-between font-mono text-[10px] tabular-nums text-text-dim">
        <span className={cn(dragging && "text-accent")}>{formatMomentTime(displayTime)}</span>
        <span>{total !== null ? formatMomentTime(total) : "—:—"}</span>
      </div>
    </div>
  );
}

function ControlButton({ children, active = false, ...props }: { active?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "flex h-11 w-11 shrink-0 items-center justify-center border transition disabled:cursor-not-allowed disabled:opacity-30",
        active ? "border-accent/60 bg-accent/15 text-accent" : "border-border bg-bg-elevated/50 text-foreground hover:border-accent/40 hover:text-accent",
      )}
    >
      {children}
    </button>
  );
}

function formatMomentTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "just now";
  if (diff < 60 * 60_000) return `${Math.round(diff / 60_000)}m`;
  if (diff < 24 * 60 * 60_000) return `${Math.round(diff / 3_600_000)}h`;
  return `${Math.round(diff / 86_400_000)}d`;
}
