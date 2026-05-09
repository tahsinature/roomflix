import { useCallback, useEffect, useRef, useState } from "react";
import {
  Captions,
  Gesture,
  MediaPlayer,
  MediaPlayerInstance,
  MediaProvider,
  Track,
  useMediaRemote,
  useMediaState,
} from "@vidstack/react";
import { AlertTriangle, Loader2, Play, RefreshCw } from "lucide-react";
import "@vidstack/react/player/styles/base.css";

import type { Subtitle } from "@shared/protocol";
import { Button } from "@/components/ui/button";
import { urlFilename } from "@/lib/utils";
import { Controls } from "./Controls";

type Props = {
  videoUrl: string | null;
  subtitles: Subtitle[];
  playing: boolean;
  currentTime: number;
  muted: boolean;
  updatedAt: number;
  serverTime: number;
  onPlay: (currentTime: number) => void;
  onPause: (currentTime: number) => void;
  onSeek: (currentTime: number) => void;
  onMutedChange: (muted: boolean) => void;
};

const DRIFT_TOLERANCE_S = 1.0;
const STALLED_TIMEOUT_MS = 15_000;
const PLAYER_FRAME_CLASS =
  "relative aspect-video w-full overflow-hidden rounded-xl bg-black ring-1 ring-white/5 shadow-2xl shadow-black/60";

type PlaybackErrorKind = "network" | "format" | "stalled";

export function VideoPlayer({
  videoUrl,
  subtitles,
  playing,
  currentTime,
  muted,
  updatedAt,
  serverTime,
  onPlay,
  onPause,
  onSeek,
  onMutedChange,
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
  const [playbackError, setPlaybackError] =
    useState<PlaybackErrorKind | null>(null);
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
    setActiveSubtitleId(null);
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

  // Sync muted.
  useEffect(() => {
    const p = playerRef.current;
    if (!p) return;
    if (p.muted !== muted) {
      markApplying(250);
      p.muted = muted;
    }
  }, [muted]);

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
  const handleVolumeChange = () => {
    if (isApplying()) return;
    const p = playerRef.current;
    if (!p) return;
    if (p.muted !== muted) onMutedChange(p.muted);
  };

  const tryResumePlayback = () => {
    const p = playerRef.current;
    if (!p) return;
    markApplying(400);
    p.play()
      .then(() => setAutoplayBlocked(false))
      .catch(() => {
        /* still blocked */
      });
  };

  // Sync the active subtitle id to Vidstack's TextTrackList. Imperative because
  // the React `default` prop only seeds initial mode, not later changes.
  useEffect(() => {
    const p = playerRef.current;
    if (!p) return;
    for (const t of p.textTracks) {
      if (t.kind !== "subtitles" && t.kind !== "captions") continue;
      t.setMode(t.id === activeSubtitleId ? "showing" : "disabled");
    }
  }, [activeSubtitleId, subtitles]);

  if (!videoUrl) {
    return (
      <div className={PLAYER_FRAME_CLASS}>
        <EmptyPlayerState />
      </div>
    );
  }

  // Format-incompatible: don't even mount Vidstack — saves the bandwidth of
  // a partial download we know can't decode. The error frame is the whole
  // visible state.
  if (playbackError === "format") {
    return (
      <div className={PLAYER_FRAME_CLASS}>
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
      onPlay={handlePlay}
      onPause={handlePause}
      onSeeked={handleSeeked}
      onVolumeChange={handleVolumeChange}
      onLoadedMetadata={handleLoadedMetadata}
      onPlayFail={() => setAutoplayBlocked(true)}
      onAutoPlayFail={() => setAutoplayBlocked(true)}
      onError={() => setPlaybackError("network")}
      className={PLAYER_FRAME_CLASS}
    >
      <MediaProvider>
        {subtitles.map((s) => (
          <Track
            key={s.id}
            id={s.id}
            src={s.url}
            kind="subtitles"
            label={s.label}
            lang={s.lang}
          />
        ))}
      </MediaProvider>

      <Captions className="pointer-events-none absolute inset-x-0 bottom-16 z-20 mx-auto max-w-[90%] text-center text-base font-medium text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.85)] sm:bottom-20 sm:text-lg" />

      <Gesture
        className="absolute inset-0 z-10 block h-full w-full"
        event="pointerup"
        action="toggle:paused"
      />

      <Controls
        subtitles={subtitles}
        activeSubtitleId={activeSubtitleId}
        onSelectSubtitle={setActiveSubtitleId}
      />

      <LoadingOverlay hasError={playbackError !== null} />
      <PrePlayCover url={videoUrl} hasError={playbackError !== null} />

      {playbackError && (
        <div className="absolute inset-0 z-30 animate-fade-in">
          <ErrorFrame kind={playbackError} url={videoUrl} onRetry={retry} />
        </div>
      )}

      {autoplayBlocked && !playbackError && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in">
          <Button variant="accent" size="lg" onClick={tryResumePlayback}>
            <Play className="h-5 w-5 fill-current" />
            Tap to join playback
          </Button>
        </div>
      )}
    </MediaPlayer>
  );
}

// Map a URL extension to one of Vidstack's accepted VideoMimeType values.
// For unrecognized containers (.mkv, .mov, etc.), `video/mp4` works as a
// no-probe hint — the browser plays based on the response's Content-Type.
function inferVideoMime(
  url: string,
):
  | "video/mp4"
  | "video/webm"
  | "video/ogg"
  | "video/3gp"
  | "video/avi"
  | "video/mpeg" {
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
      <Loader2 className="h-8 w-8 animate-spin text-violet-300/90" />
      <span className="text-xs font-medium text-white/70">Loading video…</span>
    </div>
  );
}

// Cover screen shown when the video is loaded but hasn't been started yet
// — fills the otherwise-blank black frame with the filename + a play button.
// Vanishes once started=true. Reads Vidstack media state, so it lives
// inside <MediaPlayer>.
function PrePlayCover({
  url,
  hasError,
}: {
  url: string;
  hasError: boolean;
}) {
  const canPlay = useMediaState("canPlay");
  const started = useMediaState("started");
  const remote = useMediaRemote();
  if (hasError || !canPlay || started) return null;
  return (
    <div className="absolute inset-0 z-[20] flex flex-col items-center justify-center gap-5 bg-gradient-to-b from-black/40 via-black/20 to-black/70 backdrop-blur-[2px]">
      <div className="flex flex-col items-center gap-1 px-6 text-center">
        <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40">
          Ready to play
        </div>
        <h2
          className="line-clamp-2 max-w-xl text-lg font-semibold text-white sm:text-2xl"
          title={url}
        >
          {urlFilename(url)}
        </h2>
      </div>
      <Button
        variant="accent"
        size="lg"
        onClick={() => remote.play()}
        className="shadow-2xl shadow-violet-500/30"
      >
        <Play className="h-5 w-5 fill-current" />
        Play
      </Button>
    </div>
  );
}

function ErrorFrame({
  kind,
  url,
  onRetry,
}: {
  kind: PlaybackErrorKind;
  url: string;
  onRetry?: () => void;
}) {
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
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/85 px-6 text-center backdrop-blur-sm">
      <AlertTriangle className="h-8 w-8 text-amber-300" />
      <div className="text-base font-medium text-foreground/90">
        {message.title}
      </div>
      <p className="max-w-md text-xs text-muted-foreground">{message.body}</p>
      {showRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} className="mt-2">
          <RefreshCw className="h-3.5 w-3.5" />
          Retry
        </Button>
      )}
    </div>
  );
}

function EmptyPlayerState() {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center text-muted-foreground">
      <div
        className="h-full w-full absolute inset-0 opacity-40"
        style={{
          background:
            "radial-gradient(600px 300px at 50% 40%, hsl(262 83% 58% / 0.25), transparent 60%)",
        }}
      />
      <div className="relative text-sm font-medium text-foreground/80">
        No video loaded
      </div>
      <div className="relative text-xs">
        Paste a public video URL below to get started.
      </div>
    </div>
  );
}
