import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bell, BellOff, ChevronDown, Clock, FastForward, Loader2, Pause, Play, Repeat, Rewind, SkipBack, SkipForward, Trash2, Tv } from "lucide-react";
import type { ChatMessage, ChatMoment, SessionState } from "@shared/protocol";
import { useAuth } from "@/auth/AuthContext";
import { useSessionPresence } from "@/auth/SessionPresence";
import { api } from "@/lib/api";
import { ReactionBar } from "@/components/theater/ReactionBar";
import { playChime, unlockChime } from "@/lib/chime";
import { senderTone } from "@/lib/senderColor";
import { useToast } from "@/components/Toast";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import { cn, mediaKind, urlFilename } from "@/lib/utils";

// Companion screen — open this on a phone (or any second device you're
// signed into) to chat with the room and run the playback remotely while
// the main display stays on /watch. Talks to the same WS session as
// /watch; doesn't flip presence to "watching" so it's invisible to the
// viewer count.
export default function Remote() {
  const { currentSpace, user, guest } = useAuth();
  const { state, viewers, serverTime, send, subscribeChat, subscribeChatCleared, subscribeReactions } = useSessionPresence();
  const navigate = useNavigate();
  const toast = useToast();
  const canClearChat = currentSpace?.role === "owner";
  // True when this page is rendered inside an iframe — used by the
  // /watch sidebar host. In that mode the "Open here" link and the
  // post-jump navigate would shove the host page around, so we skip
  // both: the room state is already on the parent page.
  const embedded = typeof window !== "undefined" && window.self !== window.top;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
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

  // Chime preference — persisted across sessions. Default ON. Refs
  // mirror state + meId so the WS subscribe callbacks below can read
  // the latest values without forcing re-subscriptions on every change.
  const [chimeEnabled, setChimeEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem("roomflix:chime") !== "0";
    } catch {
      return true;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("roomflix:chime", chimeEnabled ? "1" : "0");
    } catch {
      /* private mode / disabled storage */
    }
  }, [chimeEnabled]);
  const chimeEnabledRef = useRef(chimeEnabled);
  chimeEnabledRef.current = chimeEnabled;
  const meId = user?.id ?? guest?.id ?? "";
  const meIdRef = useRef(meId);
  meIdRef.current = meId;
  // Rate-limit reaction chimes so an emoji burst doesn't sound like a
  // slot machine. Chat chimes are not throttled — typing pace is its
  // own limiter.
  const lastReactionChimeRef = useRef(0);

  // Live tail — append any chat row the WS broadcasts, dedupe in case
  // the same id arrives twice across reconnects. Plays a soft chime
  // for messages from other people when sound notifications are on.
  useEffect(() => {
    return subscribeChat((msg) => {
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
      if (chimeEnabledRef.current && msg.senderId !== meIdRef.current) {
        playChime("message");
      }
    });
  }, [subscribeChat]);

  // Owner wiped chat — flush local state so the thread resets live for
  // everyone connected, not just the device that hit the button.
  useEffect(() => {
    return subscribeChatCleared(() => {
      setMessages([]);
      setConfirmingClearChat(false);
    });
  }, [subscribeChatCleared]);

  // Two-step clear so a fat-finger doesn't nuke the thread. Auto-cancels
  // after a short window.
  const [confirmingClearChat, setConfirmingClearChat] = useState(false);
  const [clearingChat, setClearingChat] = useState(false);
  useEffect(() => {
    if (!confirmingClearChat) return;
    const t = setTimeout(() => setConfirmingClearChat(false), 4000);
    return () => clearTimeout(t);
  }, [confirmingClearChat]);
  const clearChat = async () => {
    if (!currentSpace) return;
    setClearingChat(true);
    try {
      const { deleted } = await api.clearChat(currentSpace.id);
      // The chatCleared broadcast will reset our local thread too —
      // no manual setMessages needed here.
      toast.success(deleted > 0 ? `Cleared ${deleted} message${deleted === 1 ? "" : "s"}.` : "Chat was already empty.");
    } catch (err) {
      toast.error(`Couldn't clear chat. ${(err as Error).message}`);
    } finally {
      setClearingChat(false);
      setConfirmingClearChat(false);
    }
  };

  // Reactions don't render in the thread, but they still deserve a
  // ping when chime is on — same "someone reacted" signal you get
  // visually on /watch. Throttled to one chime per 2s.
  useEffect(() => {
    return subscribeReactions((event) => {
      if (!chimeEnabledRef.current) return;
      if (event.sender.id === meIdRef.current) return;
      const now = Date.now();
      if (now - lastReactionChimeRef.current < 2000) return;
      lastReactionChimeRef.current = now;
      playChime("reaction");
    });
  }, [subscribeReactions]);

  // Keyboard forwarding — embedded mode only. Keys typed inside the
  // iframe stay inside its document, so /watch never sees them. Forward
  // the two host-level shortcuts ("c" toggles the sidebar, "f" toggles
  // fullscreen) via postMessage so the parent can dispatch them. Same
  // guards as the host listener (ignore modifier combos + form fields).
  useEffect(() => {
    if (!embedded) return;
    const onKey = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (key !== "c" && key !== "f") return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      e.preventDefault();
      window.parent.postMessage({ source: "roomflix:remote", key }, window.location.origin);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [embedded]);

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

  // Virtuoso handle for imperative scroll-to-bottom after the history
  // backfill. Native auto-scroll (followOutput) handles every live
  // append from there on — no manual near-bottom math needed.
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  // Tracks whether the user is currently parked at the bottom of the
  // thread. Drives visibility of the floating "scroll to latest"
  // button — only shows up when the user has scrolled away from the
  // tail.
  const [atBottom, setAtBottom] = useState(true);
  const scrollToBottom = useCallback(() => {
    virtuosoRef.current?.scrollToIndex({
      // Number.MAX_SAFE_INTEGER is clamped by Virtuoso to the last
      // item, so this stays correct even if `messages` is stale
      // inside a callback closure.
      index: Number.MAX_SAFE_INTEGER,
      behavior: "smooth",
      align: "end",
    });
  }, []);
  useEffect(() => {
    if (loadingHistory) return;
    if (messages.length === 0) return;
    virtuosoRef.current?.scrollToIndex({ index: messages.length - 1, behavior: "auto", align: "end" });
    // Run once when history finishes loading; live appends follow via
    // Virtuoso's followOutput prop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingHistory]);

  // Unlock the chime AudioContext on the first user interaction so the
  // very next message triggers an audible ping on Chromium/Windows
  // where contexts start "suspended" until a gesture. Once primed, the
  // listener removes itself.
  useEffect(() => {
    const onInteract = () => unlockChime();
    window.addEventListener("pointerdown", onInteract, { once: true });
    window.addEventListener("keydown", onInteract, { once: true });
    return () => {
      window.removeEventListener("pointerdown", onInteract);
      window.removeEventListener("keydown", onInteract);
    };
  }, []);

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
  // player after the seek. Embedded mode (sidebar) skips the navigate
  // — the host page already IS the theater.
  const jumpToMoment = (moment: ChatMoment) => {
    send({ type: "jumpTo", moment });
    if (!embedded) navigate("/watch");
  };

  // meId declared earlier alongside the chime refs — reusing here.
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
    <main className={cn("mx-auto flex max-w-xl flex-col", embedded ? "h-[100dvh]" : "h-[calc(100dvh-4.5rem)]")}>
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Remote · {currentSpace.name}</p>
          <p className="mt-0.5 truncate text-sm text-foreground">{playingTitle ? `${viewers.length} watching · ${playingTitle}` : "Nothing playing"}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => setChimeEnabled((v) => !v)}
            aria-label={chimeEnabled ? "Mute chime" : "Enable chime"}
            title={chimeEnabled ? "Chime on — click to mute" : "Chime off — click to enable"}
            aria-pressed={chimeEnabled}
            className={cn(
              "inline-flex h-7 w-7 items-center justify-center border transition",
              chimeEnabled
                ? "border-accent/40 bg-accent/10 text-accent hover:border-accent/60"
                : "border-border bg-bg-elevated/50 text-muted-foreground hover:border-accent/30 hover:text-foreground",
            )}
          >
            {chimeEnabled ? <Bell className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5" />}
          </button>
          {/* Owner-only chat wipe. Two-step confirm so a fat-finger
              doesn't nuke the thread — first click flips to confirm
              state, second commits. The chatCleared broadcast from
              the server then resets every connected viewer's thread,
              not just the owner's. */}
          {canClearChat && messages.length > 0 && (
            <button
              type="button"
              onClick={() => {
                if (confirmingClearChat) clearChat();
                else setConfirmingClearChat(true);
              }}
              disabled={clearingChat}
              aria-label={confirmingClearChat ? "Confirm clear chat" : "Clear chat"}
              title={confirmingClearChat ? "Click again to confirm" : "Clear chat (owner only)"}
              className={cn(
                "inline-flex h-7 w-7 items-center justify-center border transition disabled:opacity-50",
                confirmingClearChat
                  ? "border-accent bg-accent/15 text-accent hover:bg-accent/20"
                  : "border-border bg-bg-elevated/50 text-muted-foreground hover:border-accent/30 hover:text-foreground",
              )}
            >
              {clearingChat ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            </button>
          )}
          {!embedded && (
            <Link
              to="/watch"
              className="inline-flex items-center gap-1.5 border border-border bg-bg-elevated/50 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground transition hover:border-accent/40 hover:text-foreground"
              title="Open theater on this device"
            >
              <Tv className="h-3.5 w-3.5" />
              Open here
            </Link>
          )}
        </div>
      </header>

      {/* Chat thread. Virtualized via react-virtuoso so the list stays
          smooth at thousands of messages; followOutput="auto" keeps it
          stuck to the bottom when the user is at the bottom and leaves
          a mid-scroll reader alone when they're not. */}
      <div className="relative flex min-h-0 flex-1 flex-col">
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
          <Virtuoso
            ref={virtuosoRef}
            data={messages}
            // Always glue to bottom on a new item — works for both
            // own sends and others' arrivals. Trades a tiny bit of
            // "preserve mid-scroll" UX for a bug-free chat tail; the
            // user can scroll up freely between messages.
            followOutput="smooth"
            initialTopMostItemIndex={Math.max(0, messages.length - 1)}
            atBottomStateChange={setAtBottom}
            className="flex-1"
            // Spacer at the end of the list so the newest bubble has
            // breathing room above the composer instead of butting
            // straight up against it.
            components={chatComponents}
            itemContent={(index, msg) => {
              const prev = index > 0 ? messages[index - 1] : null;
              return <MessageRow msg={msg} prev={prev} isMe={msg.senderId === meId} onJump={jumpToMoment} />;
            }}
          />
        )}
        {/* Scroll-to-latest affordance. Only visible when the user has
            scrolled away from the tail. Sits above the composer, with
            a subtle backdrop so it reads against any background. */}
        {!loadingHistory && messages.length > 0 && !atBottom && (
          <button
            type="button"
            onClick={scrollToBottom}
            aria-label="Scroll to latest message"
            title="Scroll to latest"
            className="absolute bottom-3 right-3 inline-flex h-9 w-9 items-center justify-center rounded-full border border-accent/40 bg-bg-elevated/95 text-accent shadow-[0_8px_24px_-8px_rgba(0,0,0,0.7)] backdrop-blur transition hover:border-accent/70 hover:bg-bg-elevated"
          >
            <ChevronDown className="h-4 w-4" />
          </button>
        )}
      </div>

      <ReactionBar
        onSend={sendMessage}
        attachedMoment={attachedMoment}
        onAttachMoment={() => setAttachedMoment(captureMoment())}
        onClearMoment={() => setAttachedMoment(null)}
      />

      {/* Progress + transport controls. Hidden when embedded as a /watch
          sidebar — the host page already owns the player's seek bar and
          control buttons, so rendering them again here would just
          duplicate chrome and steal vertical room from the chat. */}
      {!embedded && hasMedia && (
        <ProgressIndicator
          state={state!}
          skewRef={skewRef}
          onSeek={(t) => send({ type: "seek", currentTime: Math.max(0, t) })}
        />
      )}

      {!embedded && (
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
      )}
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

// Module-scoped so the same identity is passed to Virtuoso on every
// render — re-creating the object on each render would re-trigger
// virtualization re-measurement.
const chatComponents = {
  Footer: () => <div className="h-4" />,
};

// One chat row in the virtualized thread. Own messages right-align in
// the accent bubble; others left-align with a coloured initial avatar
// and a per-sender coloured name label. Consecutive messages from the
// same sender within 5 minutes group: the header (name + time) and
// avatar render only on the FIRST message in the run, subsequent rows
// just show the bubble snugly beneath. Day separators land between
// any two messages whose dates differ.
function MessageRow({ msg, prev, isMe, onJump }: { msg: ChatMessage; prev: ChatMessage | null; isMe: boolean; onJump: (moment: ChatMoment) => void }) {
  const sameSender = prev !== null && prev.senderId === msg.senderId && msg.sentAt - prev.sentAt < 5 * 60_000;
  const showDateSep = !prev || !sameDay(prev.sentAt, msg.sentAt);
  const tone = senderTone(msg.senderId);
  const initial = msg.senderName.trim().charAt(0).toUpperCase() || "?";
  const nameClass = isMe ? "text-accent" : tone.text;

  return (
    // flex-col on the wrapper prevents the inner bubble's mt-* from
    // margin-collapsing through the parent — without this, Virtuoso
    // measures rows shorter than they render and the bottom-stick
    // detection drifts.
    <div className="flex flex-col px-3">
      {showDateSep && <DateSeparator ts={msg.sentAt} />}
      <div className={cn("flex gap-2", isMe ? "flex-row-reverse" : "flex-row", sameSender && !showDateSep ? "mt-0.5" : "mt-3")}>
        {/* Avatar gutter for non-me messages. Reserves the width even
            when grouped so the bubble alignment stays consistent. */}
        {!isMe && (
          <div className="w-7 shrink-0">
            {!sameSender && (
              <span className={cn("flex h-7 w-7 items-center justify-center rounded-full border text-[11px] font-semibold uppercase", tone.avatar)}>{initial}</span>
            )}
          </div>
        )}

        <div className={cn("flex max-w-[78%] flex-col gap-0.5", isMe ? "items-end" : "items-start")}>
          {!sameSender && (
            <div className={cn("flex items-baseline gap-2 px-1", isMe && "flex-row-reverse")}>
              <span className={cn("font-mono text-[11px]", nameClass)}>{isMe ? "You" : msg.senderName}</span>
              <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-white/30">{formatShortTime(msg.sentAt)}</span>
            </div>
          )}
          <div
            className={cn(
              "rounded-md border px-2.5 py-1.5 text-sm",
              isMe ? "border-accent/40 bg-accent/15 text-foreground rounded-tr-sm" : "border-white/[0.06] bg-white/[0.04] text-foreground rounded-tl-sm",
            )}
          >
            {msg.text && <p className="whitespace-pre-wrap break-words">{msg.text}</p>}
            {msg.moment && (
              <button
                type="button"
                onClick={() => onJump(msg.moment!)}
                className="mt-1.5 inline-flex w-fit items-center gap-1.5 border border-accent/40 bg-accent/[0.06] px-2 py-1 text-[11px] text-accent transition hover:border-accent/70 hover:bg-accent/10 active:bg-accent/15"
                title="Jump the room to this scene"
              >
                <Clock className="h-3 w-3 shrink-0" />
                <span className="max-w-[180px] truncate">{msg.moment.mediaTitle || "Scene"}</span>
                {msg.moment.currentTime > 0.5 && <span className="font-mono text-[10px] text-accent/80">{formatMomentTime(msg.moment.currentTime)}</span>}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function DateSeparator({ ts }: { ts: number }) {
  return (
    <div className="mb-1 mt-3 flex items-center gap-2">
      <span className="h-px flex-1 bg-white/[0.06]" />
      <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/35">{formatDaySeparator(ts)}</span>
      <span className="h-px flex-1 bg-white/[0.06]" />
    </div>
  );
}

function sameDay(a: number, b: number): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

function formatDaySeparator(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  if (sameDay(d.getTime(), now.getTime())) return "Today";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(d.getTime(), yesterday.getTime())) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

function formatShortTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatMomentTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

