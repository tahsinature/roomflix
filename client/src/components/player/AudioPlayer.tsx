import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";
import { AlertTriangle, Loader2, Pause, Play } from "lucide-react";

import { cn, formatTime, urlFilename } from "@/lib/utils";

type Props = {
  url: string;
  title?: string | null;
  playing: boolean;
  currentTime: number;
  updatedAt: number;
  serverTime: number;
  onPlay: (currentTime: number) => void;
  onPause: (currentTime: number) => void;
  onSeek: (currentTime: number) => void;
  // Called when the track reaches the end. The Room dispatches a
  // videoEnded message which the server uses for playlist auto-advance.
  onEnded?: (endedUrl: string) => void;
  // Fired on every local volume / mute change. The hook debounces
  // before sending over WS; this prop is the raw event surface.
  onVolumeChange?: (level: number, muted: boolean) => void;
};

const DRIFT_TOLERANCE_S = 0.6;

// Audio room player built on wavesurfer.js. The waveform is the centerpiece
// visual — clicking anywhere on it seeks. Sync (play / pause / seek) goes
// through the same room-state protocol as VideoPlayer; we just route the
// effects through the WaveSurfer API instead of an <video> element.
export function AudioPlayer({ url, title, playing, currentTime, updatedAt, serverTime, onPlay, onPause, onSeek, onEnded }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WaveSurfer | null>(null);

  // While Date.now() < this timestamp, ignore feedback events from the
  // waveform — we're applying remote state and don't want it to echo back.
  const applyUntilRef = useRef(0);
  // Local skew so we can estimate server time: serverNow ≈ Date.now() - skew.
  const clockSkewRef = useRef(0);

  const [isReady, setIsReady] = useState(false);
  const [isPlayingLocal, setIsPlayingLocal] = useState(false);
  const [localTime, setLocalTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);

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

  // Create / destroy the WaveSurfer instance when the URL changes. This
  // also wires up the event handlers that bridge to the room sync.
  useEffect(() => {
    if (!containerRef.current) return;
    setIsReady(false);
    setError(null);
    setLocalTime(0);
    setDuration(0);
    markApplying(1000);

    const ws = WaveSurfer.create({
      container: containerRef.current,
      url,
      // Theme: dim grey unplayed waveform, coral fill behind the progress
      // cursor so the played portion mirrors the rest of the app's accent.
      waveColor: "hsl(230 12% 32%)",
      progressColor: "hsl(0 100% 65%)",
      cursorColor: "hsl(0 100% 71%)",
      cursorWidth: 2,
      barWidth: 2,
      barGap: 1,
      barRadius: 0,
      height: 96,
      // Pull samples from the audio element so we don't double-fetch. The
      // <audio> Wavesurfer creates serves as the actual playback source.
      normalize: true,
    });
    wsRef.current = ws;

    const onReady = () => {
      setIsReady(true);
      setDuration(ws.getDuration());
      // Once decoded, apply the latest synced state — seek to expected
      // position and play if the room is playing.
      markApplying(400);
      const target = expectedTime();
      if (Number.isFinite(target)) ws.setTime(Math.min(target, ws.getDuration()));
      if (playing) {
        ws.play().catch(() => {
          /* autoplay blocked — user gesture required */
        });
      }
    };

    const onPlayLocal = () => {
      setIsPlayingLocal(true);
      if (isApplying()) return;
      onPlay(ws.getCurrentTime());
    };
    const onPauseLocal = () => {
      setIsPlayingLocal(false);
      if (isApplying()) return;
      onPause(ws.getCurrentTime());
    };
    // Wavesurfer fires `seeking` for both user clicks and programmatic
    // setTime. The applyUntil window blocks the echo.
    const onSeekLocal = () => {
      if (isApplying()) return;
      onSeek(ws.getCurrentTime());
    };
    const onTimeUpdate = (t: number) => setLocalTime(t);
    const onErrorLocal = (e: Error) => {
      setError(e?.message || "Couldn't load this audio.");
    };
    // WaveSurfer's "finish" event = playback reached the end. Forward to
    // the Room so the server can decide whether to auto-advance.
    const onFinishLocal = () => {
      if (isApplying()) return;
      onEnded?.(url);
    };

    ws.on("ready", onReady);
    ws.on("play", onPlayLocal);
    ws.on("pause", onPauseLocal);
    ws.on("seeking", onSeekLocal);
    ws.on("timeupdate", onTimeUpdate);
    ws.on("error", onErrorLocal);
    ws.on("finish", onFinishLocal);

    return () => {
      ws.unAll();
      ws.destroy();
      wsRef.current = null;
    };
    // expectedTime captures `playing` / `currentTime` / `updatedAt` at the
    // moment the ready handler runs; that's fine — the sync effect below
    // reconciles for any updates that happen after.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  // Reconcile to remote state on every change. Skipped until the waveform
  // is decoded; ready handler does the initial seek/play once buffering done.
  useEffect(() => {
    const ws = wsRef.current;
    if (!ws || !isReady) return;
    const target = expectedTime();
    const drift = Math.abs(ws.getCurrentTime() - target);
    const localPlaying = ws.isPlaying();
    const needsSeek = Number.isFinite(target) && drift > DRIFT_TOLERANCE_S;
    const needsPlay = playing && !localPlaying;
    const needsPause = !playing && localPlaying;
    if (needsSeek || needsPlay || needsPause) markApplying(400);

    if (needsSeek) ws.setTime(Math.min(target, ws.getDuration()));
    if (needsPlay) {
      ws.play().catch(() => {
        /* autoplay blocked */
      });
    }
    if (needsPause) ws.pause();
  }, [playing, currentTime, updatedAt, isReady, expectedTime]);

  const togglePlay = () => {
    const ws = wsRef.current;
    if (!ws || !isReady) return;
    if (isPlayingLocal) ws.pause();
    else ws.play().catch(() => undefined);
  };

  const displayTitle = title?.trim() || urlFilename(url);
  const gradient = useMemo(() => titleGradient(displayTitle), [displayTitle]);

  return (
    <section className="relative w-full overflow-hidden border border-border bg-bg-elevated shadow-[0_20px_60px_-20px_rgba(0,0,0,0.8)]">
      <div className="pointer-events-none absolute inset-0" style={{ background: gradient }} aria-hidden />

      <div className="relative flex flex-col items-center gap-7 px-6 py-12 sm:gap-9 sm:py-16">
        <NowPlayingChip playing={isPlayingLocal} loading={!isReady && !error} />

        <Title text={displayTitle} url={url} />

        <div className="w-full max-w-2xl">
          <div ref={containerRef} className={cn("min-h-[96px] w-full cursor-pointer transition-opacity", !isReady && "opacity-40")} aria-label="Audio waveform — click to seek" />
          {error && (
            <div className="mt-3 flex items-start justify-center gap-2 border border-amber-300/30 bg-amber-300/[0.06] p-3 text-xs text-amber-100">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" />
              <div>
                <div className="font-medium">Couldn't load this audio</div>
                <div className="text-amber-100/70">{error}</div>
              </div>
            </div>
          )}
          <div className="mt-3 flex items-center justify-between font-mono text-[11px] tabular-nums text-text-dim">
            <span>{formatTime(localTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        <PlayPauseButton playing={isPlayingLocal} disabled={!isReady || !!error} onToggle={togglePlay} />
      </div>
    </section>
  );
}

function NowPlayingChip({ playing, loading }: { playing: boolean; loading: boolean }) {
  const label = loading ? "Loading" : playing ? "Now playing" : "Paused";
  return (
    <div className="inline-flex items-center gap-2 border border-border bg-bg-elevated/60 px-3 py-1 text-[10px] uppercase tracking-[0.22em] text-muted-foreground backdrop-blur">
      {loading ? (
        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
      ) : (
        <span className={cn("inline-block h-1.5 w-1.5 rounded-full", playing ? "animate-pulse-soft bg-accent shadow-[0_0_8px_hsl(0_100%_65%/0.7)]" : "bg-text-dim")} />
      )}
      {label}
    </div>
  );
}

function Title({ text, url }: { text: string; url: string }) {
  return (
    <div className="flex max-w-xl flex-col items-center gap-1.5 text-center">
      <h2 className="line-clamp-2 break-words font-mono text-xl font-semibold leading-tight tracking-tight text-foreground sm:text-2xl" title={url}>
        {text}
      </h2>
    </div>
  );
}

function PlayPauseButton({ playing, disabled, onToggle }: { playing: boolean; disabled: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-label={playing ? "Pause" : "Play"}
      className={cn(
        "flex h-16 w-16 items-center justify-center border border-accent/60 bg-accent text-accent-foreground transition-all duration-200 accent-glow-lg",
        "hover:bg-accent-bright hover:-translate-y-px",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      )}
    >
      {playing ? <Pause className="h-6 w-6 fill-current" /> : <Play className="h-6 w-6 fill-current" />}
    </button>
  );
}

// Deterministic hue from the title so each track has its own color mood
// without album art. Hash → 0-359° hue, used in a soft radial gradient.
function titleGradient(title: string): string {
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = (hash * 31 + title.charCodeAt(i)) | 0;
  }
  const hue = Math.abs(hash) % 360;
  return `radial-gradient(900px 500px at 50% 30%, hsl(${hue} 70% 50% / 0.18), transparent 65%)`;
}
