import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { WifiOff } from "lucide-react";
import type { PlaylistDetail } from "@shared/protocol";
import { VideoPlayer } from "@/components/player/VideoPlayer";
import { AudioPlayer } from "@/components/player/AudioPlayer";
import { LibraryPicker } from "@/components/LibraryPicker";
import { PlaylistQueue } from "@/components/PlaylistQueue";
import { useSessionSync } from "@/hooks/useSessionSync";
import { useAuth } from "@/auth/AuthContext";
import { api } from "@/lib/api";
import { cn, mediaKind } from "@/lib/utils";

// Single-page watch surface. Body only — AppNav lives in AuthedLayout.
// The thin context strip below shows which space the playback is in,
// the connection state, and the URL-picker for swapping videos.
export default function Watch() {
  const { currentSpace } = useAuth();
  const { state, serverTime, connected, stateLoaded, actions } = useSessionSync();
  const [searchParams, setSearchParams] = useSearchParams();
  const [playlistDetail, setPlaylistDetail] = useState<PlaylistDetail | null>(null);

  // Apply a deep-linked ?video= once the WS is connected and we've seen
  // the server's first state snapshot. We deliberately replace any
  // currently-loaded URL when it differs from the incoming one — clicking
  // Play on a library entry is explicit user intent, and the session
  // keeps state in memory for ~5min after the last watcher leaves, which
  // would otherwise cause a stale URL to "win" over the user's selection.
  useEffect(() => {
    if (!connected || !stateLoaded) return;
    const incoming = searchParams.get("video");
    if (!incoming) return;
    if (state.videoUrl !== incoming) {
      actions.setUrl(incoming);
    }
  }, [connected, stateLoaded, state.videoUrl, searchParams, actions]);

  // Symmetric handling for playlists — replace whatever's loaded when
  // the user explicitly picks a different playlist.
  useEffect(() => {
    if (!connected || !stateLoaded) return;
    const incoming = searchParams.get("playlist");
    if (!incoming) return;
    if (state.playlistId !== incoming) {
      actions.loadPlaylist(incoming);
    }
  }, [connected, stateLoaded, state.playlistId, searchParams, actions]);

  // Clear deep-link params once they've been applied so a reload doesn't
  // re-fire them.
  useEffect(() => {
    if (state.videoUrl === null && state.playlistId === null) return;
    if (!searchParams.has("video") && !searchParams.has("playlist")) return;
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("video");
        next.delete("playlist");
        return next;
      },
      { replace: true },
    );
  }, [state.videoUrl, state.playlistId, searchParams, setSearchParams]);

  useEffect(() => {
    if (!state.playlistId) {
      setPlaylistDetail(null);
      return;
    }
    let cancelled = false;
    api
      .getPlaylist(state.playlistId)
      .then((detail) => {
        if (!cancelled) setPlaylistDetail(detail);
      })
      .catch(() => {
        if (!cancelled) setPlaylistDetail(null);
      });
    return () => {
      cancelled = true;
    };
  }, [state.playlistId]);

  const incomingPending = (searchParams.has("video") || searchParams.has("playlist")) && state.videoUrl === null;

  return (
    <main className="mx-auto flex max-w-6xl flex-col px-4 py-6 sm:px-6 sm:py-8">
      <WatchContextStrip spaceName={currentSpace?.name ?? "—"} connected={connected} onChangeUrl={actions.setUrl} />

      <div className="flex flex-1 flex-col justify-center gap-4 py-6">
        {state.videoUrl && mediaKind(state.videoUrl) === "audio" ? (
          <AudioPlayer
            url={state.videoUrl}
            title={state.videoTitle}
            playing={state.playing}
            currentTime={state.currentTime}
            updatedAt={state.updatedAt}
            serverTime={serverTime}
            onPlay={actions.play}
            onPause={actions.pause}
            onSeek={actions.seek}
            onEnded={actions.videoEnded}
            onVolumeChange={actions.setVolume}
          />
        ) : (
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
            onEnded={actions.videoEnded}
            onLoadUrl={actions.setUrl}
            onVolumeChange={actions.setVolume}
            loadingIncoming={incomingPending}
          />
        )}

        {state.playlistId && (
          <PlaylistQueue
            detail={playlistDetail}
            currentIndex={state.playlistIndex}
            loop={state.playlistLoop}
            onNext={actions.playlistNext}
            onPrev={actions.playlistPrev}
            onJumpTo={actions.playlistJumpTo}
            onToggleLoop={actions.setPlaylistLoop}
          />
        )}
      </div>

      <footer className="flex flex-col items-center gap-2 pt-6 text-center text-xs text-text-dim">
        <span>Anyone in this space can control playback.</span>
      </footer>
    </main>
  );
}

// Page-local secondary strip. Identity / leave / brand all live in the
// global AppNav now; this just carries "Watching in <space>", the
// connection indicator, and the URL-swap picker — Watch-specific stuff
// that wouldn't make sense on other pages.
function WatchContextStrip({
  spaceName,
  connected,
  onChangeUrl,
}: {
  spaceName: string;
  connected: boolean;
  onChangeUrl: (url: string) => void;
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
      <div className="flex flex-col leading-tight">
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Watching in</span>
        <span className="text-sm font-medium text-foreground">{spaceName}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "inline-flex h-9 items-center gap-1.5 border px-3 font-mono text-xs",
            connected
              ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300"
              : "border-amber-300/30 bg-amber-300/10 text-amber-200",
          )}
          aria-label={connected ? "Connected" : "Reconnecting"}
          title={connected ? "Live — playback is synced" : "Reconnecting to playback"}
        >
          {connected ? (
            <span className="inline-flex h-2 w-2 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_8px_rgb(52_211_153/0.7)]" />
          ) : (
            <WifiOff className="h-3.5 w-3.5 animate-pulse-soft" />
          )}
          <span className="hidden lg:inline">{connected ? "Live" : "Reconnecting…"}</span>
        </span>
        <LibraryPicker onPick={onChangeUrl} />
      </div>
    </header>
  );
}
