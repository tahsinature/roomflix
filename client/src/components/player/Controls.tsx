import { Controls as VControls, FullscreenButton, MuteButton, PIPButton, PlayButton, Time, TimeSlider, Tooltip, VolumeSlider, useMediaState } from "@vidstack/react";
import { Maximize, Minimize, Pause, PictureInPicture, Play, Volume2, VolumeX } from "lucide-react";

import type { Subtitle } from "@shared/protocol";
import { SubtitleToggle } from "./SubtitleToggle";

type Props = {
  subtitles: Subtitle[];
  activeSubtitleId: string | null;
  onSelectSubtitle: (id: string | null) => void;
};

const ICON_BTN =
  "inline-flex h-9 w-9 items-center justify-center text-white/90 transition hover:bg-white/10 active:scale-95 disabled:opacity-40 outline-none focus:outline-none focus-visible:outline-none [&:focus]:shadow-none [&:focus-visible]:shadow-none";

export function Controls({ subtitles, activeSubtitleId, onSelectSubtitle }: Props) {
  return (
    <VControls.Root className="pointer-events-none absolute inset-0 z-20 flex flex-col justify-end opacity-0 transition-[opacity,transform] duration-200 ease-out data-[visible]:opacity-100">
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-black/85 via-black/40 to-transparent" />

      <VControls.Group className="pointer-events-auto relative flex flex-col gap-1.5 px-3 pb-2 pt-1 sm:px-4 sm:pb-3">
        <TimeScrubber />

        <div className="flex items-center gap-1 sm:gap-2">
          <PlayPauseButton />

          <TimeReadout />

          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <VolumeControl />

            <SubtitleToggle subtitles={subtitles} activeId={activeSubtitleId} onSelect={onSelectSubtitle} />

            <PiPControl />
            <FullscreenControl />
          </div>
        </div>
      </VControls.Group>
    </VControls.Root>
  );
}

function PlayPauseButton() {
  const paused = useMediaState("paused");
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <PlayButton className={ICON_BTN} aria-label={paused ? "Play" : "Pause"}>
          {paused ? <Play className="h-5 w-5 fill-current" /> : <Pause className="h-5 w-5 fill-current" />}
        </PlayButton>
      </Tooltip.Trigger>
      <Tooltip.Content className={tooltipClass} placement="top">
        {paused ? "Play" : "Pause"}
      </Tooltip.Content>
    </Tooltip.Root>
  );
}

function TimeReadout() {
  return (
    <div className="ml-1 flex items-center gap-1 font-mono text-xs tabular-nums text-white/85">
      <Time type="current" />
      <span className="text-white/35">/</span>
      <Time type="duration" className="text-white/55" />
    </div>
  );
}

function VolumeControl() {
  const muted = useMediaState("muted");
  const volume = useMediaState("volume");
  const effectivelyMuted = muted || volume === 0;

  return (
    <div className="group flex items-center">
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <MuteButton className={ICON_BTN} aria-label={effectivelyMuted ? "Unmute" : "Mute"}>
            {effectivelyMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
          </MuteButton>
        </Tooltip.Trigger>
        <Tooltip.Content className={tooltipClass} placement="top">
          {effectivelyMuted ? "Unmute" : "Mute"}
        </Tooltip.Content>
      </Tooltip.Root>

      <VolumeSlider.Root className="relative hidden h-9 w-0 items-center overflow-hidden transition-[width] duration-200 outline-none group-hover:w-20 group-focus-within:w-20 focus:outline-none focus-visible:outline-none sm:flex">
        <VolumeSlider.Track className="relative mx-2 h-1 flex-1 rounded-full bg-white/20">
          <VolumeSlider.TrackFill className="absolute inset-y-0 left-0 rounded-full bg-white will-change-[width]" style={{ width: "var(--slider-fill, 0%)" }} />
        </VolumeSlider.Track>
        <VolumeSlider.Thumb
          className="absolute h-3 w-3 -translate-x-1/2 rounded-full bg-white shadow-md ring-1 ring-white/30 will-change-transform"
          style={{ left: "var(--slider-fill, 0%)" }}
        />
      </VolumeSlider.Root>
    </div>
  );
}

function PiPControl() {
  const canPip = useMediaState("canPictureInPicture");
  if (!canPip) return null;
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <PIPButton className={ICON_BTN} aria-label="Picture-in-picture">
          <PictureInPicture className="h-5 w-5" />
        </PIPButton>
      </Tooltip.Trigger>
      <Tooltip.Content className={tooltipClass} placement="top">
        Picture-in-picture
      </Tooltip.Content>
    </Tooltip.Root>
  );
}

function FullscreenControl() {
  const isFullscreen = useMediaState("fullscreen");
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <FullscreenButton className={ICON_BTN} aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}>
          {isFullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
        </FullscreenButton>
      </Tooltip.Trigger>
      <Tooltip.Content className={tooltipClass} placement="top">
        {isFullscreen ? "Exit fullscreen" : "Fullscreen"}
      </Tooltip.Content>
    </Tooltip.Root>
  );
}

function TimeScrubber() {
  return (
    <TimeSlider.Root className="group relative flex h-5 w-full cursor-pointer touch-none select-none items-center outline-none focus:outline-none focus-visible:outline-none">
      <TimeSlider.Track className="relative h-1 w-full overflow-hidden rounded-full bg-white/15 transition-[height] duration-150 group-hover:h-1.5">
        <TimeSlider.Progress className="absolute inset-y-0 left-0 rounded-full bg-white/25 will-change-[width]" style={{ width: "var(--slider-progress, 0%)" }} />
        <TimeSlider.TrackFill className="absolute inset-y-0 left-0 rounded-full bg-accent will-change-[width]" style={{ width: "var(--slider-fill, 0%)" }} />
      </TimeSlider.Track>
      <TimeSlider.Thumb
        className="absolute h-3.5 w-3.5 -translate-x-1/2 rounded-full bg-white opacity-0 shadow-lg ring-2 ring-accent/60 transition-opacity duration-150 will-change-transform group-hover:opacity-100"
        style={{ left: "var(--slider-fill, 0%)" }}
      />
    </TimeSlider.Root>
  );
}

const tooltipClass = "border border-border bg-black/90 px-2.5 py-1 font-mono text-[11px] font-medium text-white/90 shadow-lg backdrop-blur";
