import { useEffect, useRef, useState } from "react";
import { Controls as VControls, FullscreenButton, MuteButton, PIPButton, PlayButton, Time, TimeSlider, Tooltip, VolumeSlider, useMediaState } from "@vidstack/react";
import { ExternalLink, Maximize, Minimize, PanelRight, Pause, PictureInPicture, Play, Radio, Replace, Smile, Volume2, VolumeX } from "lucide-react";

import type { Subtitle } from "@shared/protocol";
import { SubtitleToggle } from "./SubtitleToggle";
import { cn } from "@/lib/utils";

export type RemoteOpenMode = "sidebar" | "newWindow" | "sameWindow";

type Props = {
  subtitles: Subtitle[];
  activeSubtitleId: string | null;
  onSelectSubtitle: (id: string | null) => void;
  // Hook for the theater's reactions composer. When set, a smile button
  // appears in the controls; the theater wires it to auto-exit fullscreen
  // and focus the composer (the chrome's react bar lives OUTSIDE the
  // fullscreen element, so without this you couldn't reach it from FS).
  onReact?: () => void;
  // When set, an in-player Remote launcher appears with a small popover
  // offering three open modes. The host (Watch.tsx) decides what each
  // means — sidebar / new window / same-tab navigate.
  onOpenRemote?: (mode: RemoteOpenMode) => void;
  // Reflects whether the host currently has the sidebar open, so the
  // "Side panel" option can flip to "Close side panel" instead.
  remoteSidebarOpen?: boolean;
  // Custom fullscreen toggle + state. When provided, the fullscreen
  // button calls this instead of Vidstack's media-only FullscreenButton
  // — required by callers that need to fullscreen a wrapper element
  // (e.g. the /watch sidebar host fullscreens the row containing both
  // the player and the sidebar).
  onToggleFullscreen?: () => void;
  isFullscreen?: boolean;
};

const ICON_BTN =
  "inline-flex h-9 w-9 items-center justify-center text-white/90 transition hover:bg-white/10 active:scale-95 disabled:opacity-40 outline-none focus:outline-none focus-visible:outline-none [&:focus]:shadow-none [&:focus-visible]:shadow-none";

export function Controls({ subtitles, activeSubtitleId, onSelectSubtitle, onReact, onOpenRemote, remoteSidebarOpen, onToggleFullscreen, isFullscreen }: Props) {
  return (
    // z-50 lifts the whole control surface above the reactions composer
    // (z-40 portal in Watch.tsx). Vidstack's opacity transition on this
    // root creates a stacking context, so any z-index inside (subtitle
    // picker, Remote launcher popover) is otherwise capped at whatever
    // z-index this root carries. The control bar itself sits at the
    // bottom of the player and never overlaps the composer spatially;
    // only the upward-growing popovers needed the lift.
    <VControls.Root className="pointer-events-none absolute inset-0 z-50 flex flex-col justify-end opacity-0 transition-[opacity,transform] duration-200 ease-out data-[visible]:opacity-100">
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-black/85 via-black/40 to-transparent" />

      <VControls.Group className="pointer-events-auto relative flex flex-col gap-1.5 px-3 pb-2 pt-1 sm:px-4 sm:pb-3">
        <TimeScrubber />

        <div className="flex items-center gap-1 sm:gap-2">
          <PlayPauseButton />

          <TimeReadout />

          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <VolumeControl />

            <SubtitleToggle subtitles={subtitles} activeId={activeSubtitleId} onSelect={onSelectSubtitle} />

            {onReact && (
              <Tooltip.Root>
                <Tooltip.Trigger asChild>
                  <button type="button" onClick={onReact} aria-label="Send a reaction" className={ICON_BTN}>
                    <Smile className="h-5 w-5" />
                  </button>
                </Tooltip.Trigger>
                <Tooltip.Content className={tooltipClass} placement="top">
                  Send a reaction
                </Tooltip.Content>
              </Tooltip.Root>
            )}

            {onOpenRemote && <RemoteLauncher onOpen={onOpenRemote} sidebarOpen={remoteSidebarOpen ?? false} />}

            <PiPControl />
            {onToggleFullscreen ? (
              <CustomFullscreenControl onToggle={onToggleFullscreen} isFullscreen={!!isFullscreen} />
            ) : (
              <FullscreenControl />
            )}
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

// Variant that calls a host-supplied toggle instead of Vidstack's
// FullscreenButton — used by /watch so the sidebar is included in the
// fullscreen surface.
function CustomFullscreenControl({ onToggle, isFullscreen }: { onToggle: () => void; isFullscreen: boolean }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button type="button" onClick={onToggle} className={ICON_BTN} aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}>
          {isFullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
        </button>
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

// In-player launcher for /remote. Click → popover with three open
// modes. Closes on outside click + Escape. Lives inside the Vidstack
// controls bar; the popover anchors above the button so it sits over
// the video rather than under the bottom bezel.
function RemoteLauncher({ onOpen, sidebarOpen }: { onOpen: (mode: RemoteOpenMode) => void; sidebarOpen: boolean }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node | null)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const pick = (mode: RemoteOpenMode) => {
    onOpen(mode);
    setOpen(false);
  };

  return (
    <div ref={wrapRef} className="relative">
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-label="Open chat"
            aria-haspopup="menu"
            aria-expanded={open}
            title="Open chat (C)"
            className={cn(ICON_BTN, open && "bg-white/10")}
          >
            <Radio className="h-5 w-5" />
          </button>
        </Tooltip.Trigger>
        <Tooltip.Content className={tooltipClass} placement="top">
          Open chat <span className="ml-1 font-mono text-[10px] uppercase tracking-[0.12em] text-white/55">C</span>
        </Tooltip.Content>
      </Tooltip.Root>

      {open && (
        <div
          role="menu"
          // z-50 puts the popover above the ReactionBar (z-40 portal in
          // Watch.tsx) — without this the composer sits on top and
          // clips the menu.
          className="absolute bottom-full right-0 z-50 mb-2 w-56 border border-white/10 bg-black/90 p-1 shadow-[0_12px_32px_-12px_rgba(0,0,0,0.7)] backdrop-blur-xl"
        >
          <div className="border-b border-white/[0.06] px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.22em] text-white/45">Open remote</div>
          <RemoteLauncherOption
            icon={<PanelRight className="h-3.5 w-3.5" />}
            label={sidebarOpen ? "Close side panel" : "Side panel"}
            hint={sidebarOpen ? "Hide the sidebar" : "Dock here, beside the player"}
            onClick={() => pick("sidebar")}
          />
          <RemoteLauncherOption
            icon={<ExternalLink className="h-3.5 w-3.5" />}
            label="New window"
            hint="Detached popup — keep on a second screen"
            onClick={() => pick("newWindow")}
          />
          <RemoteLauncherOption
            icon={<Replace className="h-3.5 w-3.5" />}
            label="Replace this tab"
            hint="Navigate this tab to /remote"
            onClick={() => pick("sameWindow")}
          />
        </div>
      )}
    </div>
  );
}

function RemoteLauncherOption({ icon, label, hint, onClick }: { icon: React.ReactNode; label: string; hint: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-start gap-2.5 px-2.5 py-2 text-left text-sm text-white/90 transition hover:bg-white/[0.06]"
    >
      <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center text-accent">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block leading-tight">{label}</span>
        <span className="mt-0.5 block font-mono text-[10px] text-white/45">{hint}</span>
      </span>
    </button>
  );
}
