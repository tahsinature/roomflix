import { useEffect, useMemo, useRef } from "react";
import { type SessionState, type Viewer } from "@shared/protocol";
import { emptyState, useSessionPresence } from "@/auth/SessionPresence";

const VOLUME_DEBOUNCE_MS = 200;

// Watch-page hook. Backs onto the single shared WS opened by
// SessionPresenceProvider. On mount, flips status to "watching" so the
// server marks this identity as a viewer; on unmount, flips back to
// "online". Bundles typed playback actions over the shared socket.
//
// The provider owns the connection — this hook just specializes the
// API for the player. Other surfaces (dashboard chip, library header)
// use useSessionPresence() directly.

export type SessionSync = {
  state: SessionState;
  viewers: Viewer[];
  serverTime: number;
  connected: boolean;
  stateLoaded: boolean;
  clientId: string;
  actions: {
    play: (currentTime: number) => void;
    pause: (currentTime: number) => void;
    seek: (currentTime: number) => void;
    setUrl: (videoUrl: string) => void;
    loadPlaylist: (playlistId: string) => void;
    playlistNext: () => void;
    playlistPrev: () => void;
    playlistJumpTo: (index: number) => void;
    setPlaylistLoop: (loop: boolean) => void;
    videoEnded: (endedUrl: string) => void;
    // Debounced to ~200ms — slider drags fire dozens of events per
    // second and we don't want one per ws.send. The trailing edge wins.
    setVolume: (level: number, muted: boolean) => void;
  };
};

export function useSessionSync(): SessionSync {
  const presence = useSessionPresence();

  // Promote to "watching" while mounted; demote on unmount. Server
  // broadcasts presence + viewers on either transition, so other tabs
  // see the change instantly.
  useEffect(() => {
    presence.setStatus("watching");
    return () => presence.setStatus("online");
  }, [presence.setStatus]);

  // Trailing-edge debounce for volume — slider drags fire many events
  // per second. We coalesce to the latest value within VOLUME_DEBOUNCE_MS.
  const volumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingVolume = useRef<{ level: number; muted: boolean } | null>(null);

  useEffect(() => {
    return () => {
      if (volumeTimer.current) clearTimeout(volumeTimer.current);
    };
  }, []);

  const actions = useMemo(
    () => ({
      play: (currentTime: number) => presence.send({ type: "play", currentTime }),
      pause: (currentTime: number) => presence.send({ type: "pause", currentTime }),
      seek: (currentTime: number) => presence.send({ type: "seek", currentTime }),
      setUrl: (videoUrl: string) => presence.send({ type: "setUrl", videoUrl }),
      loadPlaylist: (playlistId: string) => presence.send({ type: "loadPlaylist", playlistId }),
      playlistNext: () => presence.send({ type: "playlistNext" }),
      playlistPrev: () => presence.send({ type: "playlistPrev" }),
      playlistJumpTo: (index: number) => presence.send({ type: "playlistJumpTo", index }),
      setPlaylistLoop: (loop: boolean) => presence.send({ type: "setPlaylistLoop", loop }),
      videoEnded: (endedUrl: string) => presence.send({ type: "videoEnded", endedUrl }),
      setVolume: (level: number, muted: boolean) => {
        pendingVolume.current = { level, muted };
        if (volumeTimer.current) return;
        volumeTimer.current = setTimeout(() => {
          volumeTimer.current = null;
          const next = pendingVolume.current;
          pendingVolume.current = null;
          if (!next) return;
          presence.send({ type: "setVolume", level: next.level, muted: next.muted });
        }, VOLUME_DEBOUNCE_MS);
      },
    }),
    [presence.send],
  );

  return {
    state: presence.state ?? emptyState,
    viewers: presence.viewers,
    serverTime: presence.serverTime,
    connected: presence.connected,
    stateLoaded: presence.stateLoaded,
    clientId: presence.clientId,
    actions,
  };
}
