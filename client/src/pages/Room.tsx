import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Check, Copy, Users, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { VideoPlayer } from "@/components/player/VideoPlayer";
import { LibraryPicker } from "@/components/LibraryPicker";
import { useRoomSync } from "@/hooks/useRoomSync";
import { cn } from "@/lib/utils";

export default function Room() {
  const { roomId = "" } = useParams();
  const { state, viewers, serverTime, connected, stateLoaded, actions } = useRoomSync(roomId);
  const [searchParams, setSearchParams] = useSearchParams();

  const [copied, setCopied] = useState(false);

  // Pre-load a video URL from ?video= when arriving via "Play" from the
  // library. Apply once the WS is connected and we've seen the server's
  // first state snapshot — otherwise we might stomp an existing room's
  // video.
  useEffect(() => {
    if (!connected || !stateLoaded) return;
    const incoming = searchParams.get("video");
    if (!incoming) return;
    if (state.videoUrl === null) {
      actions.setUrl(incoming);
    }
  }, [connected, stateLoaded, state.videoUrl, searchParams, actions]);

  // Clear ?video= once the synced state actually has a videoUrl — whether
  // or not it matches what we tried to apply. Until then we keep the param
  // so the player can show a loading frame instead of flashing the empty
  // URL-input state.
  useEffect(() => {
    if (state.videoUrl === null) return;
    if (!searchParams.has("video")) return;
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("video");
        return next;
      },
      { replace: true },
    );
  }, [state.videoUrl, searchParams, setSearchParams]);

  const incomingPending = searchParams.has("video") && state.videoUrl === null;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — user can copy the URL bar */
    }
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-6 sm:px-6 sm:py-8">
      <RoomHeader roomId={roomId} viewers={viewers} connected={connected} copied={copied} onCopy={copyLink} onChangeUrl={actions.setUrl} />

      <div className="flex flex-1 flex-col justify-center gap-4 py-6">
        <VideoPlayer
          videoUrl={state.videoUrl}
          videoTitle={state.videoTitle}
          subtitles={state.subtitles}
          playing={state.playing}
          currentTime={state.currentTime}
          updatedAt={state.updatedAt}
          serverTime={serverTime}
          onPlay={actions.play}
          onPause={actions.pause}
          onSeek={actions.seek}
          onLoadUrl={actions.setUrl}
          loadingIncoming={incomingPending}
        />
      </div>

      <footer className="flex flex-col items-center gap-2 pt-6 text-center text-xs text-text-dim">
        <span>Anyone in this room can control playback. Be nice.</span>
      </footer>
    </main>
  );
}

function RoomHeader(props: { roomId: string; viewers: number; connected: boolean; copied: boolean; onCopy: () => void; onChangeUrl: (url: string) => void }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon">
          <Link to="/" aria-label="Back to home">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex flex-col leading-tight">
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Room</span>
          <span className="font-mono text-sm font-medium text-foreground" title={`Room ID: ${props.roomId}`}>
            #{props.roomId}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Chrome aria-label={`${props.viewers} ${props.viewers === 1 ? "viewer" : "viewers"}`}>
          {/* Mobile: just the number centered (keeps the 36×36 square shape).
              lg+: icon + number + "viewer(s)" label, full pill. */}
          <Users className="hidden h-3.5 w-3.5 lg:inline" />
          <span className="tabular-nums">{props.viewers}</span>
          <span className="hidden lg:inline">{props.viewers === 1 ? " viewer" : " viewers"}</span>
        </Chrome>
        <Chrome
          className={cn(
            "border-transparent",
            props.connected ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300" : "border-amber-300/30 bg-amber-300/10 text-amber-200",
          )}
          aria-label={props.connected ? "Connected" : "Reconnecting"}
        >
          {props.connected ? (
            <span className="inline-flex h-2 w-2 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_8px_rgb(52_211_153/0.7)]" />
          ) : (
            <WifiOff className="h-3.5 w-3.5 animate-pulse-soft" />
          )}
          <span className="hidden lg:inline">{props.connected ? "Live" : "Reconnecting…"}</span>
        </Chrome>
        <LibraryPicker onPick={props.onChangeUrl} />
        <Button variant="outline" size="sm" aria-label="Copy link" onClick={props.onCopy} className="h-9 w-9 px-0 lg:w-auto lg:px-3">
          {props.copied ? <Check className="h-3.5 w-3.5 text-live" /> : <Copy className="h-3.5 w-3.5" />}
          <span className="hidden lg:inline">{props.copied ? "Copied" : "Copy link"}</span>
        </Button>
      </div>
    </header>
  );
}

// Status pill used in the room header. Square 36×36 on mobile so all chrome
// items share the same shape; on lg+ it stretches and shows full labels next
// to the icon. Static (non-interactive) — the corresponding action buttons
// (Library, Copy) match this size with their own h-9/w-9 mobile overrides.
function Chrome({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex h-9 w-9 items-center justify-center gap-1.5 border border-border bg-bg-elevated/50 font-mono text-xs text-muted-foreground lg:w-auto lg:gap-1.5 lg:px-3",
        className,
      )}
      {...props}
    />
  );
}
