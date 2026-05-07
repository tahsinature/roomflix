import { useCallback, useEffect, useRef, useState } from "react";
import {
  Captions,
  Gesture,
  MediaPlayer,
  MediaPlayerInstance,
  MediaProvider,
  Track,
} from "@vidstack/react";
import { Play } from "lucide-react";
import "@vidstack/react/player/styles/base.css";

import type { Subtitle } from "@shared/protocol";
import { Button } from "@/components/ui/button";
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
const PLAYER_FRAME_CLASS =
  "relative aspect-video w-full overflow-hidden rounded-xl bg-black ring-1 ring-white/5 shadow-2xl shadow-black/60";

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
  // Subtitle selection is per-viewer state; tracks themselves come from the
  // synced room state via props.
  const [activeSubtitleId, setActiveSubtitleId] = useState<string | null>(null);

  // Reset selection when the video changes — the previous selection's id is
  // no longer in the new track list.
  useEffect(() => {
    setActiveSubtitleId(null);
  }, [videoUrl]);

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

  return (
    <MediaPlayer
      ref={playerRef}
      src={videoUrl}
      load="eager"
      playsInline
      onPlay={handlePlay}
      onPause={handlePause}
      onSeeked={handleSeeked}
      onVolumeChange={handleVolumeChange}
      onLoadedMetadata={handleLoadedMetadata}
      onPlayFail={() => setAutoplayBlocked(true)}
      onAutoPlayFail={() => setAutoplayBlocked(true)}
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

      {autoplayBlocked && (
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
