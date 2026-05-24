import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Film, Music, Users2 } from "lucide-react";
import type { SessionState, Viewer } from "@shared/protocol";
import { Button } from "@/components/ui/button";
import { TheaterBezel } from "@/components/dashboard/TheaterBezel";
import { MembersPanel } from "@/components/dashboard/MembersPanel";
import { useAuth } from "@/auth/AuthContext";
import { useSessionPresence } from "@/auth/SessionPresence";
import { mediaKind, urlFilename } from "@/lib/utils";

// Logged-in landing — a calm, asymmetric three-zone surface:
//   • Left   — greeting + clock + date for the viewer.
//   • Right  — members panel: who else is in the space + where they
//              are (local time / weather, when known).
//   • Right (bottom) — the mini-theater bezel: a small framed screen
//              echoing the actual theater, live preview when the room
//              is playing, ambient clock fill when standby.
// One layout serves both idle + playing; only the screen's content
// swaps. Catalog surfaces own everything list-y — this page never
// restates Library / Storage / Shares.
export default function Dashboard() {
  const { user, currentSpace } = useAuth();
  const { state, viewers, serverTime, members, participants } = useSessionPresence();
  const navigate = useNavigate();

  if (!currentSpace) return <NoSpaceState />;

  const greeting = user?.displayName?.trim() || (user ? `@${user.username}` : "");
  const playingTitle = state?.videoUrl ? state.videoTitle || urlFilename(state.videoUrl) : null;
  const playing = Boolean(state?.videoUrl);
  // Bezel chrome lives on the user (Phase 3 ships the editor); default
  // until then.
  const bezelStyle = user?.homeBezelStyle ?? "cinema";

  return (
    <main className="relative">
      <BackgroundOrbs />
      <div className="relative mx-auto grid min-h-[calc(100dvh-4rem)] max-w-6xl grid-cols-1 items-center gap-y-10 px-6 py-10 md:grid-cols-12 md:gap-x-10 md:py-14 lg:gap-x-14 lg:px-10">
        {/* Left — greeting + clock. The "anchor" of the page. */}
        <div className="md:col-span-7">
          <HomeClock greeting={greeting} spaceName={currentSpace.name} />
        </div>

        {/* Right — members + theater bezel, stacked. */}
        <div className="flex flex-col gap-6 md:col-span-5">
          <MembersPanel members={members} participants={participants} meId={user?.id ?? ""} />
          <TheaterBezel
            style={bezelStyle}
            playing={playing}
            statusLabel={playing ? "On Air" : "Standby"}
            kindLabel={
              playing ? (mediaKind(state!.videoUrl) === "image" ? "Photo" : mediaKind(state!.videoUrl) === "audio" ? "Audio" : "Video") : "Standby"
            }
            caption={playing ? (playingTitle ?? "") : "Step into the theater"}
            onOpen={() => navigate("/watch")}
            ariaLabel={playing ? `Now playing: ${playingTitle}. Open the theater.` : "Open the theater"}
          >
            <ScreenContent state={state} serverTime={serverTime} viewers={viewers} />
          </TheaterBezel>
        </div>
      </div>
    </main>
  );
}

// Greeting + big clock + date — anchored top-left. Drives the calm
// rhythm of the page; everything else hangs off this.
function HomeClock({ greeting, spaceName }: { greeting: string; spaceName: string }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  const time = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const dateLabel = now.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
  return (
    <div className="relative">
      {/* Off-centre glow behind the clock — same motif as /watch idle. */}
      <div
        className="pointer-events-none absolute -inset-12"
        style={{ background: "radial-gradient(560px 360px at 30% 50%, hsl(0 90% 60% / 0.10), transparent 65%)" }}
        aria-hidden
      />
      <div className="relative flex max-w-full flex-col gap-5">
        <div className="font-mono text-[10px] uppercase tracking-[0.42em] text-white/40">
          {greeting ? (
            <>
              Hi, {greeting} <span className="text-white/20">·</span> {spaceName}
            </>
          ) : (
            <>
              {spaceName} <span className="text-white/20">·</span> standby
            </>
          )}
        </div>
        <div className="font-mono text-[clamp(3.5rem,10vw,8rem)] font-medium leading-none tabular-nums text-white/85">{time}</div>
        <div className="flex items-center gap-3 text-white/40">
          <span className="h-px w-10 bg-white/15" aria-hidden />
          <span className="font-mono text-[11px] uppercase tracking-[0.28em]">{dateLabel}</span>
        </div>
      </div>
    </div>
  );
}

// What goes inside the bezel's screen well. When the room is playing,
// kind-specific live content; when idle, a tiny standby fill matching
// the page's calm.
function ScreenContent({ state, serverTime, viewers }: { state: SessionState | null; serverTime: number; viewers: Viewer[] }) {
  // Narrow on the actual URL — Boolean() coercion alone doesn't carry
  // the non-null through to nested reads.
  const url = state?.videoUrl ?? null;
  if (!state || !url) return <StandbyFill viewers={viewers} />;
  const kind = mediaKind(url);
  const title = state.videoTitle || urlFilename(url) || "";
  if (kind === "image") {
    return <img src={url} alt={title} className="h-full w-full object-cover" loading="lazy" />;
  }
  if (kind === "audio") {
    return (
      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-indigo-900/40 via-purple-900/20 to-black">
        <span className="flex h-14 w-14 items-center justify-center border border-white/15 bg-black/45 text-white/80 shadow-[0_0_32px_rgba(0,0,0,0.6)] animate-pulse-soft">
          <Music className="h-6 w-6" />
        </span>
      </div>
    );
  }
  return <MiniVideoPreview state={state} serverTime={serverTime} />;
}

// Standby fill — a small echo of /watch idle inside the bezel: tiny
// clock + date, soft glow.
function StandbyFill({ viewers }: { viewers: Viewer[] }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  const time = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const date = now.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-gradient-to-br from-bg-elevated/30 via-black to-black">
      <div
        className="absolute inset-0"
        style={{ background: "radial-gradient(360px 220px at 38% 42%, hsl(0 90% 60% / 0.10), transparent 65%)" }}
        aria-hidden
      />
      <div className="relative flex flex-col items-center gap-1.5 pb-8">
        <span className="font-mono text-3xl font-medium leading-none tabular-nums text-white/85 sm:text-4xl">{time}</span>
        <span className="flex items-center gap-2 text-white/35">
          <span className="h-px w-6 bg-white/15" aria-hidden />
          <span className="font-mono text-[10px] uppercase tracking-[0.24em]">{date}</span>
        </span>
        {viewers.length > 0 && (
          <span className="mt-3 font-mono text-[9px] uppercase tracking-[0.24em] text-emerald-300/70">{viewers.length} in the room</span>
        )}
      </div>
    </div>
  );
}

// Tiny synced <video> for the home monitor — always muted, no controls,
// home doesn't flip presence to "watching". Mirrors VideoPlayer's sync
// logic in a much smaller surface: track server-clock skew, compute
// expected time, drift past 1s triggers a reseek, play/pause follows
// the room. Source errors fall back to the styled video card so the
// monitor stays presentable.
function MiniVideoPreview({ state, serverTime }: { state: SessionState; serverTime: number }) {
  const ref = useRef<HTMLVideoElement>(null);
  const skewRef = useRef(0);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    skewRef.current = Date.now() - serverTime;
  }, [serverTime]);

  useEffect(() => {
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
  // whenever the room seeks or updates its anchor.
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
  // we should be paused, force it back to paused.
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
        <span className="flex h-14 w-14 items-center justify-center border border-white/15 bg-black/45 text-white/75 shadow-[0_0_32px_rgba(0,0,0,0.6)]">
          <Film className="h-6 w-6" />
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
