import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Film, Music, Play, Users2 } from "lucide-react";
import type { SessionState, Viewer } from "@shared/protocol";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/auth/AuthContext";
import { useSessionPresence } from "@/auth/SessionPresence";
import { cn, mediaKind, urlFilename } from "@/lib/utils";

// Logged-in landing — deliberately quiet. One job: be a soft front door
// into the theater. Catalog surfaces (Library / Storage / Shares) own
// everything list-y, so this page does NOT restate any of that. Just a
// greeting, the current space, a single CTA, and a small "now playing"
// peek when the space's synced session has something loaded.
export default function Dashboard() {
  const { user, currentSpace } = useAuth();
  const { state, viewers, serverTime } = useSessionPresence();
  const navigate = useNavigate();

  if (!currentSpace) return <NoSpaceState />;

  const greeting = user?.displayName?.trim() || (user ? `@${user.username}` : "");
  const playingTitle = state?.videoUrl ? state.videoTitle || urlFilename(state.videoUrl) : null;

  return (
    <main className="relative">
      <BackgroundOrbs />
      {/* One vertical column, centered. Monitor is the hero; the
          greeting + space name sit above it as a quiet supporting line.
          Same composition on phone and desktop — just sizes scale. */}
      <div className="mx-auto flex min-h-[calc(100dvh-7rem)] max-w-2xl flex-col items-center justify-center gap-8 px-6 py-10 text-center sm:gap-10">
        <div className="flex flex-col gap-2">
          {greeting && <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Hi, {greeting}</p>}
          <h1 className="text-balance text-2xl font-medium tracking-tight text-foreground sm:text-3xl">
            You're in <span className="text-accent">{currentSpace.name}</span>
          </h1>
        </div>

        <TheaterMonitor state={state} viewers={viewers} serverTime={serverTime} playingTitle={playingTitle} onOpen={() => navigate("/watch")} />
      </div>
    </main>
  );
}

// One tile, two faces. Playing → live mini-preview of what the room is
// watching. Idle → a "standby" monitor with a play glyph. Same shape
// either way so the page composition (welcome | theater) doesn't shift
// when the session starts or stops.
function TheaterMonitor({
  state,
  viewers,
  serverTime,
  playingTitle,
  onOpen,
}: {
  state: SessionState | null;
  viewers: Viewer[];
  serverTime: number;
  playingTitle: string | null;
  onOpen: () => void;
}) {
  const playing = Boolean(state?.videoUrl);
  const kind = playing ? mediaKind(state!.videoUrl) : null;
  const headline = playing ? (playingTitle ?? "") : "Step into the theater";
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={playing ? `Now playing: ${playingTitle}. Open the theater.` : "Open the theater."}
      className={cn(
        "group relative flex w-full max-w-xl flex-col overflow-hidden border text-left transition",
        playing
          ? "border-accent/30 bg-bg-elevated/30 shadow-[0_30px_80px_-24px_hsl(0_100%_65%/0.35)] hover:border-accent/60 hover:bg-bg-elevated/50"
          : "border-border bg-bg-elevated/20 shadow-[0_30px_80px_-24px_rgba(0,0,0,0.55)] hover:border-accent/40 hover:bg-bg-elevated/40",
      )}
    >
      {/* Top bezel — small status strip. Accent caption when live, muted when idle. */}
      <div className={cn("flex items-center justify-between gap-3 border-b px-4 py-2", playing ? "border-white/[0.06] bg-black/40" : "border-white/[0.04] bg-black/25")}>
        <span className={cn("flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em]", playing ? "text-accent" : "text-muted-foreground")}>
          {playing && <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-accent" aria-hidden />}
          {playing ? (viewers.length > 0 ? `${viewers.length} watching` : "Now playing") : "Theater"}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {playing ? (kind === "image" ? "Photo" : kind === "audio" ? "Audio" : "Video") : "Standby"}
        </span>
      </div>

      <div className="relative aspect-video w-full overflow-hidden bg-black">
        {playing ? (
          <MonitorContent state={state!} serverTime={serverTime} kind={kind!} title={headline} />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-bg-elevated/40 via-black to-black">
            <span className="flex h-14 w-14 items-center justify-center border border-white/15 bg-black/45 text-white/65 shadow-[0_0_32px_rgba(0,0,0,0.6)] transition group-hover:text-accent group-hover:border-accent/40">
              <Play className="h-6 w-6 fill-current" />
            </span>
          </div>
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 px-4 pb-3 pt-8">
          <span className="line-clamp-2 text-sm font-medium text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)] sm:text-base">{headline}</span>
          <span className="flex shrink-0 items-center gap-1 font-mono text-[11px] uppercase tracking-[0.16em] text-accent transition group-hover:text-accent-bright">
            Open
            <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
          </span>
        </div>
      </div>
    </button>
  );
}

// Per-kind screen content. Image plays itself; video gets a muted,
// uncontrollable live mini-player synced to the room state; audio keeps
// the styled card (a silent audio element on the home page would be
// useless).
function MonitorContent({ state, serverTime, kind, title }: { state: SessionState; serverTime: number; kind: "image" | "audio" | "video"; title: string }) {
  if (kind === "image" && state.videoUrl) {
    return <img src={state.videoUrl} alt={title} className="h-full w-full object-cover" loading="lazy" />;
  }
  if (kind === "audio") {
    return (
      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-indigo-900/40 via-purple-900/20 to-black">
        <span className="flex h-16 w-16 items-center justify-center border border-white/15 bg-black/45 text-white/80 shadow-[0_0_32px_rgba(0,0,0,0.6)] animate-pulse-soft">
          <Music className="h-7 w-7" />
        </span>
      </div>
    );
  }
  if (state.videoUrl) {
    return <MiniVideoPreview state={state} serverTime={serverTime} />;
  }
  return (
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-rose-950/40 via-black to-black">
      <span className="flex h-16 w-16 items-center justify-center border border-white/15 bg-black/45 text-white/75 shadow-[0_0_32px_rgba(0,0,0,0.6)]">
        <Film className="h-7 w-7" />
      </span>
    </div>
  );
}

// Tiny synced <video> for the home monitor — always muted, no controls,
// and the home page doesn't flip presence status to "watching" so it
// doesn't count as a viewer. Sync mirrors VideoPlayer's logic in a much
// smaller surface: track server-clock skew, compute expected time, drift
// past 1s triggers a reseek, play/pause follows the room. If the source
// errors, fall back to the styled video card so the monitor stays
// presentable.
function MiniVideoPreview({ state, serverTime }: { state: SessionState; serverTime: number }) {
  const ref = useRef<HTMLVideoElement>(null);
  const skewRef = useRef(0);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    skewRef.current = Date.now() - serverTime;
  }, [serverTime]);

  useEffect(() => {
    // Reset the error flag when the source URL changes — a fresh item
    // gets its own chance to load.
    setErrored(false);
  }, [state.videoUrl]);

  // Play/pause enforcement — fires the moment state.playing flips so the
  // mini-player follows the room instantly, independent of seek-time
  // changes.
  useEffect(() => {
    const v = ref.current;
    if (!v || !state.videoUrl) return;
    if (state.playing) {
      if (v.paused) v.play().catch(() => {});
    } else if (!v.paused) {
      v.pause();
    }
  }, [state.playing, state.videoUrl]);

  // Drift correction — seek the home preview to the room's expected time
  // whenever the room seeks or updates its anchor. Decoupled from the
  // play/pause effect so the two never get in each other's way.
  useEffect(() => {
    const v = ref.current;
    if (!v || !state.videoUrl) return;
    const expected = state.playing ? state.currentTime + Math.max(0, (Date.now() - skewRef.current - state.updatedAt) / 1000) : state.currentTime;
    const drift = Math.abs(v.currentTime - expected);
    if (Number.isFinite(expected) && drift > 1.0) {
      try {
        v.currentTime = expected;
      } catch {
        /* readyState too low; loadedmetadata handler will retry */
      }
    }
  }, [state.playing, state.currentTime, state.updatedAt, state.videoUrl]);

  // Backstop: if the <video> fires a "play" event while the room says
  // we should be paused (browser auto-resume on tab focus, an in-flight
  // play() winning a race, etc.), force it back to paused. A ref keeps
  // the current state.playing reachable from the event handler without
  // re-binding the listener on every change.
  const playingRef = useRef(state.playing);
  playingRef.current = state.playing;
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const onPlay = () => {
      if (!playingRef.current) v.pause();
    };
    v.addEventListener("play", onPlay);
    return () => v.removeEventListener("play", onPlay);
  }, []);

  const onLoadedMetadata = () => {
    const v = ref.current;
    if (!v) return;
    const expected = state.playing ? state.currentTime + Math.max(0, (Date.now() - skewRef.current - state.updatedAt) / 1000) : state.currentTime;
    if (Number.isFinite(expected)) {
      try {
        v.currentTime = expected;
      } catch {
        /* ignore */
      }
    }
    if (state.playing) v.play().catch(() => {});
  };

  if (errored) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-rose-950/40 via-black to-black">
        <span className="flex h-16 w-16 items-center justify-center border border-white/15 bg-black/45 text-white/75 shadow-[0_0_32px_rgba(0,0,0,0.6)]">
          <Film className="h-7 w-7" />
        </span>
      </div>
    );
  }

  return (
    // eslint-disable-next-line jsx-a11y/media-has-caption
    <video
      ref={ref}
      key={state.videoUrl ?? ""}
      src={state.videoUrl ?? undefined}
      muted
      playsInline
      preload="auto"
      onLoadedMetadata={onLoadedMetadata}
      onError={() => setErrored(true)}
      className="h-full w-full object-cover"
    />
  );
}

function BackgroundOrbs() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="glow-orb glow-orb-coral absolute -right-32 -top-40 h-[36rem] w-[36rem]" />
      <div className="glow-orb glow-orb-indigo absolute -left-40 top-[30%] h-[32rem] w-[32rem]" />
    </div>
  );
}

function NoSpaceState() {
  return (
    <main className="relative">
      <BackgroundOrbs />
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-6 text-center">
        <Users2 className="h-7 w-7 text-text-dim" />
        <h1 className="mt-4 text-2xl font-medium text-foreground">You're not in a space.</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Roomflix groups your library, playlists, and storage into spaces. Create a new one or redeem an invite code to get started.
        </p>
        <Button asChild variant="accent" size="lg" className="mt-6">
          <Link to="/settings/space">
            Manage spaces <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </main>
  );
}
