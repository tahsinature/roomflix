import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Check, Copy, Link2, Users, Wifi, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { VideoPlayer } from "@/components/player/VideoPlayer";
import { LibraryPicker } from "@/components/LibraryPicker";
import { useRoomSync } from "@/hooks/useRoomSync";
import { cn } from "@/lib/utils";

export default function Room() {
  const { roomId = "" } = useParams();
  const { state, viewers, serverTime, connected, stateLoaded, actions } =
    useRoomSync(roomId);
  const [searchParams, setSearchParams] = useSearchParams();

  const [urlInput, setUrlInput] = useState("");
  const [copied, setCopied] = useState(false);

  // Pre-load a video URL from ?video= when arriving via "Play" from the
  // library. Apply once the WS is connected and we've seen the server's
  // first state snapshot — otherwise we might stomp an existing room's
  // video. After applying (or skipping), drop the param so reloads don't
  // re-trigger.
  useEffect(() => {
    if (!connected || !stateLoaded) return;
    const incoming = searchParams.get("video");
    if (!incoming) return;
    if (state.videoUrl === null) {
      actions.setUrl(incoming);
    }
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("video");
        return next;
      },
      { replace: true },
    );
  }, [connected, stateLoaded, state.videoUrl, searchParams, setSearchParams, actions]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — user can copy the URL bar */
    }
  };

  const submitUrl = (e: React.FormEvent) => {
    e.preventDefault();
    const url = urlInput.trim();
    if (url) {
      actions.setUrl(url);
      setUrlInput("");
    }
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-6 sm:px-6 sm:py-8">
      <RoomHeader
        viewers={viewers}
        connected={connected}
        copied={copied}
        onCopy={copyLink}
        onChangeUrl={actions.setUrl}
      />

      <div className="flex flex-1 flex-col justify-center gap-4 py-6">
        <VideoPlayer
          videoUrl={state.videoUrl}
          subtitles={state.subtitles}
          playing={state.playing}
          currentTime={state.currentTime}
          updatedAt={state.updatedAt}
          serverTime={serverTime}
          onPlay={actions.play}
          onPause={actions.pause}
          onSeek={actions.seek}
        />

        {!state.videoUrl && (
          <form onSubmit={submitUrl} className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="Paste a public video URL (.mp4, .webm, etc.)"
                className="pl-9"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
              />
            </div>
            <Button type="submit" variant="accent" disabled={!urlInput.trim()}>
              Load video
            </Button>
          </form>
        )}
      </div>

      <footer className="flex flex-col items-center gap-2 pt-6 text-center text-xs text-muted-foreground">
        <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 font-mono text-xs font-medium text-foreground/80 backdrop-blur">
          #{roomId}
        </span>
        <span>Anyone in this room can control playback. Be nice.</span>
      </footer>
    </main>
  );
}

function RoomHeader(props: {
  viewers: number;
  connected: boolean;
  copied: boolean;
  onCopy: () => void;
  onChangeUrl: (url: string) => void;
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3">
      <Button asChild variant="ghost" size="icon">
        <Link to="/" aria-label="Back to home">
          <ArrowLeft className="h-4 w-4" />
        </Link>
      </Button>

      <div className="flex flex-wrap items-center gap-2">
        <Badge
          aria-label={`${props.viewers} ${props.viewers === 1 ? "viewer" : "viewers"}`}
        >
          <Users className="h-3.5 w-3.5" />
          {props.viewers}
          <span className="hidden lg:inline">
            {props.viewers === 1 ? " viewer" : " viewers"}
          </span>
        </Badge>
        <Badge
          className={cn(
            props.connected
              ? "text-emerald-300"
              : "text-amber-300 animate-pulse",
          )}
          aria-label={props.connected ? "Connected" : "Reconnecting"}
        >
          {props.connected ? (
            <Wifi className="h-3.5 w-3.5" />
          ) : (
            <WifiOff className="h-3.5 w-3.5" />
          )}
          <span className="hidden lg:inline">
            {props.connected ? "Connected" : "Reconnecting…"}
          </span>
        </Badge>
        <LibraryPicker onPick={props.onChangeUrl} />
        <Button
          variant="outline"
          size="sm"
          aria-label="Copy link"
          onClick={props.onCopy}
        >
          {props.copied ? (
            <Check className="h-3.5 w-3.5 text-emerald-400" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
          <span className="hidden lg:inline">
            {props.copied ? "Copied" : "Copy link"}
          </span>
        </Button>
      </div>
    </header>
  );
}

function Badge({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium text-muted-foreground backdrop-blur",
        className,
      )}
      {...props}
    />
  );
}
