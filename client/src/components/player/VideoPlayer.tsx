import { useCallback, useEffect, useRef, useState } from "react";
import { Captions, Gesture, MediaPlayer, MediaPlayerInstance, MediaProvider, Track, useMediaState } from "@vidstack/react";
import { AlertTriangle, HelpCircle, Link2, Loader2, Play, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import "@vidstack/react/player/styles/base.css";

import type { Subtitle } from "@shared/protocol";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { urlFilename } from "@/lib/utils";
import { Controls } from "./Controls";
import { TitleBar } from "./TitleBar";

type Props = {
  videoUrl: string | null;
  // Synced library title for videoUrl. Falls back to the URL's filename when
  // unset (older rooms or pre-resolution states).
  videoTitle?: string | null;
  subtitles: Subtitle[];
  playing: boolean;
  currentTime: number;
  updatedAt: number;
  serverTime: number;
  onPlay: (currentTime: number) => void;
  onPause: (currentTime: number) => void;
  onSeek: (currentTime: number) => void;
  // Called when the video element fires `ended`. The Room dispatches a
  // videoEnded message which the server uses for playlist auto-advance.
  onEnded?: (endedUrl: string) => void;
  // Called when the user submits a URL from the empty-player form.
  onLoadUrl: (url: string) => void;
  // Fired on every local volume / mute change. The hook debounces
  // before sending over WS; this prop is the raw event surface.
  onVolumeChange?: (level: number, muted: boolean) => void;
  // Fired once the active source's metadata has decoded with a
  // positive duration. The remote uses this to draw a progress bar.
  // The player itself doesn't care about its own duration — this is
  // purely a fan-out to other tabs.
  onDurationKnown?: (duration: number | null) => void;
  // Hook for the in-player Remote launcher. Each option calls back
  // with the chosen open-mode; the host (Watch.tsx) dispatches.
  onOpenRemote?: (mode: "sidebar" | "newWindow" | "sameWindow") => void;
  remoteSidebarOpen?: boolean;
  // Custom fullscreen target. When set, the player's fullscreen button
  // calls this instead of Vidstack's media-only fullscreen — needed so
  // the sidebar host can fullscreen its outer wrapper and keep the
  // sidebar visible.
  onToggleFullscreen?: () => void;
  isFullscreen?: boolean;
  // True when the room is initializing with a URL passed via ?video= but the
  // synced state hasn't caught up yet. Avoids flashing the URL-input form
  // when we already know what's about to load.
  loadingIncoming?: boolean;
  // Theater mode — fill the parent (no card border / aspect box) and let
  // the surrounding surface own the title bar.
  fill?: boolean;
  // Optional reaction hook — when set, the player's Controls show a smile
  // button. Clicking it bubbles up so the theater can exit fullscreen and
  // open the composer (the composer lives in the theater chrome, outside
  // the fullscreen element).
  onReact?: () => void;
};

const DRIFT_TOLERANCE_S = 1.0;
const STALLED_TIMEOUT_MS = 15_000;

// Frame for the live MediaPlayer — must always be aspect-video so the video
// itself doesn't get distorted or letterboxed at the wrong ratio.
const PLAYER_FRAME_CLASS = "relative aspect-video w-full overflow-hidden bg-black border border-border shadow-[0_20px_60px_-20px_rgba(0,0,0,0.8)]";

// Frame for placeholder states (empty / loading / format-error). On phones
// aspect-video gives ~200px which can't fit the URL form, so we drop to a
// content-sized box with a min-height floor. On sm+ (≥640px) the aspect ratio
// kicks back in to match the eventual video frame's visual rhythm.
const STATIC_FRAME_CLASS = "relative min-h-[24rem] w-full overflow-hidden bg-black border border-border shadow-[0_20px_60px_-20px_rgba(0,0,0,0.8)] sm:aspect-video sm:min-h-0";

// Theater mode: drop the card chrome (border / shadow / aspect box) and
// fill the parent — the theater surface owns the framing. Vidstack's
// base.css only stretches the <video> to full height in fullscreen
// (otherwise height:auto + the player's 16:9 aspect box, which shrinks a
// portrait clip to a tiny letterboxed rectangle); [&_video]:h-full forces
// it to fill the frame here too. object-fit:contain (also from base.css)
// keeps the real aspect ratio.
const FILL_FRAME_CLASS = "relative h-full w-full overflow-hidden bg-black [&_video]:h-full";

type PlaybackErrorKind = "network" | "format" | "stalled";

export function VideoPlayer({
  videoUrl,
  videoTitle,
  subtitles,
  playing,
  currentTime,
  updatedAt,
  serverTime,
  onPlay,
  onPause,
  onSeek,
  onEnded,
  onLoadUrl,
  onVolumeChange,
  onDurationKnown,
  onOpenRemote,
  remoteSidebarOpen,
  onToggleFullscreen,
  isFullscreen,
  loadingIncoming = false,
  fill = false,
  onReact,
}: Props) {
  const playerRef = useRef<MediaPlayerInstance>(null);
  // While Date.now() < this timestamp, ignore feedback events from the
  // player — we're applying remote state and don't want it to echo back.
  const applyUntilRef = useRef(0);
  // Skew so we can estimate server time locally: serverNow ≈ Date.now() - skew.
  const clockSkewRef = useRef(0);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  // Differentiate the failure modes so the overlay can speak honestly:
  //   "format"  — browser definitively can't decode this container/codec
  //   "network" — Vidstack/<video> fired an actual error event
  //   "stalled" — we never got loadedmetadata within the timeout (silent hang)
  const [playbackError, setPlaybackError] = useState<PlaybackErrorKind | null>(null);
  // Set true once loadedmetadata fires for the current source, so the stalled
  // timeout knows whether the source is actually progressing.
  const metadataLoadedRef = useRef(false);
  const stalledTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Bumped by the Retry button to force a remount of MediaPlayer (key on
  // the element below). Triggers a fresh fetch from the same URL.
  const [retryNonce, setRetryNonce] = useState(0);
  // Subtitle selection is per-viewer state; tracks themselves come from the
  // synced room state via props.
  const [activeSubtitleId, setActiveSubtitleId] = useState<string | null>(null);

  // Reset per-source UI state when the video changes. Also pre-check format
  // support: if the browser flat-out says it can't decode this MIME type,
  // skip rendering the player and show the format error directly.
  useEffect(() => {
    // Auto-pick a subtitle on each new video. Prefers a track whose lang
    // matches the viewer's browser locale; falls back to the first track.
    // The user can still toggle off via the captions menu.
    setActiveSubtitleId(pickInitialSubtitle(subtitles));
    metadataLoadedRef.current = false;
    if (!videoUrl) {
      setPlaybackError(null);
      return;
    }

    const formatMime = mimeForCanPlayType(videoUrl);
    if (formatMime) {
      const test = document.createElement("video");
      if (test.canPlayType(formatMime) === "") {
        setPlaybackError("format");
        return;
      }
    }
    setPlaybackError(null);

    stalledTimerRef.current = setTimeout(() => {
      if (!metadataLoadedRef.current) setPlaybackError("stalled");
    }, STALLED_TIMEOUT_MS);

    return () => {
      if (stalledTimerRef.current) {
        clearTimeout(stalledTimerRef.current);
        stalledTimerRef.current = null;
      }
    };
  }, [videoUrl, retryNonce]);

  const retry = () => {
    metadataLoadedRef.current = false;
    setPlaybackError(null);
    setRetryNonce((n) => n + 1);
  };

  useEffect(() => {
    clockSkewRef.current = Date.now() - serverTime;
  }, [serverTime]);

  const expectedTime = useCallback(() => {
    if (!playing) return currentTime;
    const serverNow = Date.now() - clockSkewRef.current;
    return currentTime + Math.max(0, (serverNow - updatedAt) / 1000);
  }, [playing, currentTime, updatedAt]);

  const markApplying = (ms: number) => {
    applyUntilRef.current = Math.max(applyUntilRef.current, Date.now() + ms);
  };
  const isApplying = () => Date.now() < applyUntilRef.current;

  // URL change → Vidstack reloads from the new src; suppress the events.
  useEffect(() => {
    if (videoUrl) markApplying(800);
  }, [videoUrl]);

  // Sync play/pause/seek to the expected remote state.
  useEffect(() => {
    const p = playerRef.current;
    if (!p || !videoUrl) return;

    const target = expectedTime();
    const drift = Math.abs(p.currentTime - target);

    const needsSeek = Number.isFinite(target) && drift > DRIFT_TOLERANCE_S;
    const needsPlay = playing && p.paused;
    const needsPause = !playing && !p.paused;

    if (needsSeek || needsPlay || needsPause) markApplying(400);

    if (needsSeek) {
      try {
        p.currentTime = target;
      } catch {
        // readyState may be too low; loaded-metadata handler will retry.
      }
    }
    if (needsPlay) {
      p.play()
        .then(() => setAutoplayBlocked(false))
        .catch(() => setAutoplayBlocked(true));
    }
    if (needsPause) {
      p.pause().catch(() => {
        /* ignore */
      });
    }
  }, [playing, currentTime, updatedAt, videoUrl, expectedTime]);

  // Re-apply target time when metadata loads — readyState was previously too
  // low for currentTime writes to take.
  const handleLoadedMetadata = () => {
    metadataLoadedRef.current = true;
    // Cancel the stalled timer; if it already fired, also clear the error
    // so the overlay disappears now that playback has actually recovered.
    if (stalledTimerRef.current) {
      clearTimeout(stalledTimerRef.current);
      stalledTimerRef.current = null;
    }
    setPlaybackError((cur) => (cur === "stalled" ? null : cur));

    const p = playerRef.current;
    if (!p || !videoUrl) return;

    // Fire an initial volume report. Vidstack's onVolumeChange only
    // fires when the level/muted state actually changes — the default
    // state on mount (1.0, unmuted) wouldn't otherwise be broadcast.
    // Without this, peers see no volume info until the user touches
    // the slider.
    onVolumeChange?.(p.volume, p.muted);
    // Report duration to the room so /remote can render its progress
    // bar. Vidstack exposes duration on the player ref once metadata
    // resolves; bail if we got NaN/0 (some live streams).
    const d = p.duration;
    if (typeof d === "number" && Number.isFinite(d) && d > 0) onDurationKnown?.(d);
    markApplying(400);
    const target = expectedTime();
    if (Number.isFinite(target)) {
      try {
        p.currentTime = target;
      } catch {
        /* ignore */
      }
    }
    if (playing) {
      p.play()
        .then(() => setAutoplayBlocked(false))
        .catch(() => setAutoplayBlocked(true));
    }
  };

  const handlePlay = () => {
    // The video is playing now — clear any "autoplay blocked" overlay,
    // even if playback was started elsewhere (space key, Vidstack's own
    // controls) rather than by one of our play() calls.
    setAutoplayBlocked(false);
    if (isApplying()) return;
    onPlay(playerRef.current?.currentTime ?? 0);
  };
  const handlePause = () => {
    if (isApplying()) return;
    onPause(playerRef.current?.currentTime ?? 0);
  };
  const handleSeeked = () => {
    if (isApplying()) return;
    onSeek(playerRef.current?.currentTime ?? 0);
  };
  const tryResumePlayback = () => {
    const p = playerRef.current;
    if (!p) return;
    markApplying(400);
    // Optimistic: hide the overlay immediately so the click feels
    // instant. If play() rejects (e.g. still blocked for some reason),
    // we'll flip it back to blocked and the overlay reappears.
    setAutoplayBlocked(false);
    p.play().catch(() => setAutoplayBlocked(true));
  };

  // Sync the active subtitle id to Vidstack's TextTrackList. Imperative because
  // the React `default` prop only seeds initial mode, not later changes.
  //
  // Important: Vidstack adds tracks to player.textTracks ASYNCHRONOUSLY after
  // <Track> mounts, so a single pass on effect-run can miss them. We also
  // listen for the `add` event and re-apply, which catches both the initial
  // auto-activation and any tracks that arrive late.
  useEffect(() => {
    const p = playerRef.current;
    if (!p) return;
    const apply = () => {
      for (const t of p.textTracks) {
        if (t.kind !== "subtitles" && t.kind !== "captions") continue;
        t.setMode(t.id === activeSubtitleId ? "showing" : "disabled");
      }
    };
    apply();
    p.textTracks.addEventListener("add", apply);
    return () => {
      p.textTracks.removeEventListener("add", apply);
    };
  }, [activeSubtitleId, subtitles]);

  if (!videoUrl) {
    return <div className={fill ? FILL_FRAME_CLASS : STATIC_FRAME_CLASS}>{loadingIncoming ? <LoadingFrame /> : <EmptyPlayerState onLoadUrl={onLoadUrl} />}</div>;
  }

  // Format-incompatible: don't even mount Vidstack — saves the bandwidth of
  // a partial download we know can't decode. The error frame is the whole
  // visible state.
  if (playbackError === "format") {
    return (
      <div className={fill ? FILL_FRAME_CLASS : STATIC_FRAME_CLASS}>
        <ErrorFrame kind="format" url={videoUrl} />
      </div>
    );
  }

  return (
    <MediaPlayer
      key={retryNonce}
      ref={playerRef}
      // Pass type up front so Vidstack skips its HEAD-probe (which would
      // require CORS on the video host). The browser ignores this hint and
      // uses the server's Content-Type for actual playback.
      src={{ src: videoUrl, type: inferVideoMime(videoUrl) }}
      load="eager"
      playsInline
      crossOrigin={null}
      keyTarget="document"
      onPlay={handlePlay}
      onPause={handlePause}
      onSeeked={handleSeeked}
      onEnd={() => onEnded?.(videoUrl)}
      onLoadedMetadata={handleLoadedMetadata}
      onPlayFail={() => setAutoplayBlocked(true)}
      onAutoPlayFail={() => setAutoplayBlocked(true)}
      onError={() => setPlaybackError("network")}
      // Local volume + mute changes — every drag of the slider triggers
      // this; the parent debounces before sending over WS.
      // Vidstack passes the volume payload directly (volume/muted) —
      // no event-with-detail wrapper at the callback boundary.
      onVolumeChange={(e) => onVolumeChange?.(e.volume, e.muted)}
      className={fill ? FILL_FRAME_CLASS : PLAYER_FRAME_CLASS}
    >
      <MediaProvider>
        {subtitles.map((s) => (
          // Route every subtitle through our same-origin proxy so the
          // browser doesn't reject cross-origin fetches when the user's
          // CDN doesn't return CORS headers (most don't, by default).
          // The proxy normalizes everything to VTT regardless of source.
          <Track key={`${s.id}:${s.url}`} id={s.id} src={`/api/library/subtitle?url=${encodeURIComponent(s.url)}`} type="vtt" kind="subtitles" label={s.label} lang={s.lang} />
        ))}
      </MediaProvider>

      <Captions className="pointer-events-none absolute inset-x-0 bottom-16 z-20 mx-auto max-w-[90%] text-center text-base font-medium text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.85)] sm:bottom-20 sm:text-lg" />

      {/* Single tap anywhere → play/pause. Double tap on the left or
          right half → 10s seek back / forward (YouTube/Netflix style).
          Vidstack treats `dblpointerup` as a higher-priority gesture so
          the underlying single-tap toggle is suppressed on double-tap. */}
      <Gesture className="absolute inset-0 z-10 block h-full w-full" event="pointerup" action="toggle:paused" />
      <Gesture className="absolute inset-y-0 left-0 z-10 block h-full w-1/2" event="dblpointerup" action="seek:-10" />
      <Gesture className="absolute inset-y-0 right-0 z-10 block h-full w-1/2" event="dblpointerup" action="seek:10" />

      {!fill && <TitleBar title={videoTitle || urlFilename(videoUrl)} />}
      <Controls
        subtitles={subtitles}
        activeSubtitleId={activeSubtitleId}
        onSelectSubtitle={setActiveSubtitleId}
        onReact={onReact}
        onOpenRemote={onOpenRemote}
        remoteSidebarOpen={remoteSidebarOpen}
        onToggleFullscreen={onToggleFullscreen}
        isFullscreen={isFullscreen}
      />

      <LoadingOverlay hasError={playbackError !== null} />

      {playbackError && (
        <div className="absolute inset-0 z-30 animate-fade-in">
          <ErrorFrame kind={playbackError} url={videoUrl} onRetry={retry} />
        </div>
      )}

      {autoplayBlocked && !playbackError && (
        // Whole overlay is the click target — tapping anywhere on the
        // dimmed area resumes playback. The media name is shown below the
        // play glyph so a paused autoplay still tells you what's queued.
        <button
          type="button"
          onClick={tryResumePlayback}
          aria-label="Resume playback"
          className="group absolute inset-0 z-30 flex flex-col items-center justify-center gap-5 bg-black/60 px-6 backdrop-blur-sm animate-fade-in transition hover:bg-black/50"
        >
          <span className="flex h-16 w-16 items-center justify-center border border-white/20 bg-black/40 text-white shadow-[0_0_24px_rgba(0,0,0,0.5)] transition group-hover:scale-105">
            <Play className="h-7 w-7 fill-current" />
          </span>
          <span className="flex max-w-[42rem] flex-col items-center gap-1.5 text-center">
            <span className="line-clamp-2 font-mono text-base font-medium text-white/95 sm:text-lg" title={videoTitle || urlFilename(videoUrl)}>
              {videoTitle || urlFilename(videoUrl)}
            </span>
            <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-white/45">Tap to play</span>
          </span>
        </button>
      )}
    </MediaPlayer>
  );
}

// Map a URL extension to one of Vidstack's accepted VideoMimeType values.
// For unrecognized containers (.mkv, .mov, etc.), `video/mp4` works as a
// no-probe hint — the browser plays based on the response's Content-Type.
// Pick which subtitle to start with when a new video loads. Prefers a track
// whose language matches the browser's current locale (so an "es" track
// auto-activates for a Spanish viewer); otherwise falls back to the first
// track. Returns null when no subtitles are attached.
function pickInitialSubtitle(subtitles: Subtitle[]): string | null {
  if (subtitles.length === 0) return null;
  const browserLang = navigator.language?.split("-")[0]?.toLowerCase();
  if (browserLang) {
    const match = subtitles.find((s) => s.lang?.toLowerCase().startsWith(browserLang));
    if (match) return match.id;
  }
  return subtitles[0]?.id ?? null;
}

function inferVideoMime(url: string): "video/mp4" | "video/webm" | "video/ogg" | "video/3gp" | "video/avi" | "video/mpeg" {
  const ext = url.split("?")[0].split("#")[0].split(".").pop()?.toLowerCase();
  switch (ext) {
    case "webm":
      return "video/webm";
    case "ogv":
    case "ogg":
      return "video/ogg";
    case "3gp":
      return "video/3gp";
    case "avi":
      return "video/avi";
    case "mpeg":
    case "mpg":
      return "video/mpeg";
    default:
      return "video/mp4";
  }
}

// MIME types we use specifically for canPlayType pre-checks. Different from
// `inferVideoMime` (which feeds Vidstack's loader) — this needs to match
// what the browser actually probes for, including .mkv/.avi/etc that Vidstack
// won't accept as a `type` hint.
function mimeForCanPlayType(url: string): string | null {
  const ext = url.split("?")[0].split("#")[0].split(".").pop()?.toLowerCase();
  switch (ext) {
    case "mp4":
      return "video/mp4";
    case "webm":
      return "video/webm";
    case "ogv":
    case "ogg":
      return "video/ogg";
    case "mkv":
      return "video/x-matroska";
    case "mov":
      return "video/quicktime";
    case "m4v":
      return "video/x-m4v";
    case "avi":
      return "video/x-msvideo";
    case "3gp":
      return "video/3gpp";
    default:
      return null; // unknown extension; let Vidstack/the server's content-type drive it
  }
}

function extOf(url: string): string {
  const ext = url.split("?")[0].split("#")[0].split(".").pop()?.toLowerCase();
  return ext ? `.${ext}` : "this format";
}

// Loading spinner shown while the source isn't ready to play yet (no
// canPlay) or has temporarily stalled mid-playback for more data (waiting).
// Lives inside <MediaPlayer> so it can read media state. Hidden while an
// error is showing — the error frame should be the only thing.
function LoadingOverlay({ hasError }: { hasError: boolean }) {
  const canPlay = useMediaState("canPlay");
  const waiting = useMediaState("waiting");
  if (hasError) return null;
  // Show spinner when:
  //   • canPlay=false → still buffering enough to begin playback
  //   • waiting=true  → buffer drained mid-playback, video is paused for data
  if (canPlay && !waiting) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-[25] flex flex-col items-center justify-center gap-2 bg-black/30 backdrop-blur-[1px]">
      <Loader2 className="h-8 w-8 animate-spin text-accent/90" />
      <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-white/65">Loading video…</span>
    </div>
  );
}

function ErrorFrame({ kind, url, onRetry }: { kind: PlaybackErrorKind; url: string; onRetry?: () => void }) {
  const message = (() => {
    switch (kind) {
      case "format":
        return {
          title: `Your browser can't play ${extOf(url)}`,
          body: "The browser reported it doesn't support this video format. Try another browser, or convert the file to MP4 (H.264).",
        };
      case "network":
        return {
          title: "Can't reach this video",
          body: "The URL didn't load. It may have been deleted, moved, or blocked by the host. Check the library for an updated link.",
        };
      case "stalled":
        return {
          title: "This video isn't loading",
          body: "Loading hung for too long. The format may be unsupported, or the host may be slow.",
        };
    }
  })();

  // Format errors don't get a retry — the format isn't going to change.
  // Network and stalled errors might recover (transient outage, slow server).
  const showRetry = kind !== "format" && onRetry;

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/90 px-6 text-center backdrop-blur-sm">
      <AlertTriangle className="h-8 w-8 text-amber-300" />
      <div className="font-mono text-base font-medium text-white/95">{message.title}</div>
      <p className="max-w-md text-xs leading-relaxed text-white/65">{message.body}</p>
      {showRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} className="mt-2">
          <RefreshCw className="h-3.5 w-3.5" />
          Retry
        </Button>
      )}
    </div>
  );
}

function LoadingFrame() {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center">
      <div className="absolute inset-0 h-full w-full opacity-50" style={{ background: "radial-gradient(600px 300px at 50% 40%, hsl(0 100% 65% / 0.18), transparent 60%)" }} />
      <Loader2 className="relative h-8 w-8 animate-spin text-accent/90" />
      <span className="relative font-mono text-[11px] uppercase tracking-[0.18em] text-white/65 sm:text-xs">Loading video…</span>
    </div>
  );
}

function EmptyPlayerState({ onLoadUrl }: { onLoadUrl: (url: string) => void }) {
  const [input, setInput] = useState("");
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const url = input.trim();
    if (!url) return;
    onLoadUrl(url);
    setInput("");
  };

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 px-4 text-center text-muted-foreground sm:px-8">
      <div
        className="absolute inset-0 h-full w-full opacity-50"
        style={{
          background: "radial-gradient(600px 300px at 50% 40%, hsl(0 100% 65% / 0.15), transparent 60%)",
        }}
      />
      <div className="relative flex flex-col items-center gap-2">
        <span className="section-label">Nothing playing</span>
        <div className="font-mono text-base font-semibold text-foreground/90 sm:text-lg">No video loaded</div>
        <div className="text-xs text-muted-foreground sm:text-sm">Paste a public video URL to get started.</div>
      </div>

      <form onSubmit={submit} className="relative flex w-full max-w-xl flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-dim" />
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="https://…  (.mp4, .webm, etc.)"
            className="pl-9"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            autoFocus
          />
        </div>
        <Button type="submit" variant="accent" disabled={!input.trim()} className="h-11">
          Load video
        </Button>
      </form>

      <Link to="/help" className="relative inline-flex items-center gap-1.5 text-[11px] text-muted-foreground transition hover:text-foreground">
        <HelpCircle className="h-3 w-3" />
        Don't have a URL? See the hosting guide
      </Link>
    </div>
  );
}
