import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { Collection, CollectionHealth } from "@shared/protocol";
import { VideoPlayer } from "@/components/player/VideoPlayer";
import { AudioPlayer } from "@/components/player/AudioPlayer";
import { PhotoPlayer } from "@/components/player/PhotoPlayer";
import { CollectionStrip } from "@/components/CollectionStrip";
import { TheaterTopBar } from "@/components/theater/TheaterTopBar";
import { IdleScreen } from "@/components/theater/IdleScreen";
import { UnavailableScreen } from "@/components/theater/UnavailableScreen";
import { useSessionSync } from "@/hooks/useSessionSync";
import { useAuth } from "@/auth/AuthContext";
import { api } from "@/lib/api";
import { cn, mediaKind, urlFilename } from "@/lib/utils";

// Idle delay before the auto-hiding chrome fades out.
const CHROME_HIDE_MS = 3200;

// The theater — a full-bleed, chrome-free home-theater display. One
// surface for every media kind: video, audio, and photos, played from
// a standalone URL or a synced mixed-media collection. The single
// per-space session decides what's on screen; this page renders it and
// surfaces auto-hiding controls.
export default function Watch() {
  const { currentSpace } = useAuth();
  const { state, viewers, serverTime, connected, stateLoaded, actions } = useSessionSync();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [collection, setCollection] = useState<Collection | null>(null);
  const [collectionHealth, setCollectionHealth] = useState<CollectionHealth | null>(null);

  // ── Deep links — ?video= / ?collection= ───────────────────────────
  // Each replaces whatever's loaded when it differs: clicking Play on a
  // library entry or a collection is explicit intent.
  useEffect(() => {
    if (!connected || !stateLoaded) return;
    const incoming = searchParams.get("video");
    if (incoming && state.videoUrl !== incoming) actions.setUrl(incoming);
  }, [connected, stateLoaded, state.videoUrl, searchParams, actions]);

  useEffect(() => {
    if (!connected || !stateLoaded) return;
    const incoming = searchParams.get("collection");
    if (incoming && state.collectionId !== incoming) actions.loadCollection(incoming);
  }, [connected, stateLoaded, state.collectionId, searchParams, actions]);

  // Clear deep-link params once applied so a reload doesn't re-fire them.
  useEffect(() => {
    if (state.videoUrl === null && state.collectionId === null) return;
    if (!searchParams.has("video") && !searchParams.has("collection")) return;
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("video");
        next.delete("collection");
        return next;
      },
      { replace: true },
    );
  }, [state.videoUrl, state.collectionId, searchParams, setSearchParams]);

  // Fetch the loaded collection's items for the filmstrip.
  useEffect(() => {
    if (!state.collectionId) {
      setCollection(null);
      return;
    }
    let cancelled = false;
    api
      .getCollection(state.collectionId)
      .then((c) => {
        if (!cancelled) setCollection(c);
      })
      .catch(() => {
        if (!cancelled) setCollection(null);
      });
    return () => {
      cancelled = true;
    };
  }, [state.collectionId]);

  // Probe the collection's item URLs — drives the "unavailable" indicators
  // in the filmstrip and the player.
  useEffect(() => {
    if (!state.collectionId) {
      setCollectionHealth(null);
      return;
    }
    let cancelled = false;
    api
      .getCollectionHealth(state.collectionId)
      .then((h) => {
        if (!cancelled) setCollectionHealth(h);
      })
      .catch(() => {
        if (!cancelled) setCollectionHealth(null);
      });
    return () => {
      cancelled = true;
    };
  }, [state.collectionId]);

  // ── Auto-hiding chrome ─────────────────────────────────────────────
  const [chromeVisible, setChromeVisible] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Set only while the library dropdown is open — the chrome must not fade
  // out from under an open popover. Hovering the bar otherwise does NOT
  // hold it open: like any video player, it fades on plain inactivity.
  const chromeLocked = useRef(false);

  const scheduleHide = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      // Re-check rather than hide while a popover is open.
      if (chromeLocked.current) scheduleHide();
      else setChromeVisible(false);
    }, CHROME_HIDE_MS);
  }, []);

  const bumpChrome = useCallback(() => {
    setChromeVisible(true);
    scheduleHide();
  }, [scheduleHide]);

  useEffect(() => {
    bumpChrome();
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [bumpChrome]);

  // Only treat a mouse event as activity when the cursor actually moved.
  // Hiding the chrome flips pointer-events / cursor under a stationary
  // cursor, which makes the browser emit a zero-distance mousemove — that
  // would otherwise re-show the chrome at once and it could never stay
  // hidden. The first event is recorded but ignored (can't tell real from
  // synthetic yet); movement generates a stream, so the next one bumps.
  const lastPointer = useRef<{ x: number; y: number } | null>(null);
  const onPointerActivity = useCallback(
    (e: React.MouseEvent) => {
      const prev = lastPointer.current;
      lastPointer.current = { x: e.clientX, y: e.clientY };
      if (prev && (prev.x !== e.clientX || prev.y !== e.clientY)) bumpChrome();
    },
    [bumpChrome],
  );

  const kind = mediaKind(state.videoUrl);

  // Fresh current-URL for the keydown handler without re-registering it
  // every time the synced item changes.
  const videoUrlRef = useRef(state.videoUrl);
  videoUrlRef.current = state.videoUrl;

  // ←/→ navigate the loaded collection — for video, audio, and photos
  // alike. The one exception: a video in fullscreen, where the arrows
  // should seek instead; there we bow out and let the video player's own
  // shortcuts run. Capture phase + stopImmediatePropagation so a
  // non-fullscreen video doesn't ALSO seek. The listener registers once
  // when a collection loads — before any video player mounts — so it
  // reliably wins over the player's document-level shortcuts.
  useEffect(() => {
    if (!state.collectionId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      // A fullscreen video keeps the arrows for seeking.
      if (mediaKind(videoUrlRef.current) === "video" && document.fullscreenElement) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.key === "ArrowRight") actions.collectionNext();
      else actions.collectionPrev();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [state.collectionId, actions]);

  // Escape leaves the theater for the library. A video in fullscreen is
  // the exception — there Escape belongs to exiting fullscreen, so we let
  // the first press do that and a second one (no longer fullscreen) exits.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (document.fullscreenElement) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      navigate("/library");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);

  // A deep link is mid-apply when the param is present but the session
  // hasn't loaded anything yet — used to suppress the idle flash.
  const incomingPending = (searchParams.has("video") || searchParams.has("collection")) && state.videoUrl === null;

  // Idle = nothing loaded and nothing about to load.
  const idle = !state.videoUrl && !state.collectionId && !incomingPending;
  // Chrome is always shown on the idle screen — its controls are the only
  // way to start something.
  const chromeShown = chromeVisible || idle;

  const title = state.videoTitle || (state.videoUrl ? urlFilename(state.videoUrl) : "Nothing playing");
  const contextLabel = state.collectionId
    ? `Collection · item ${state.collectionIndex + 1}${collection ? ` / ${collection.items.length}` : ""}`
    : idle
      ? "Standby"
      : kind === "audio"
        ? "Audio"
        : kind === "image"
          ? "Photo"
          : "Video";
  // When a collection is loaded but not yet fetched, fall back to a count
  // > 1 so the photo nav arrows still appear.
  const photoTotal = state.collectionId ? (collection?.items.length ?? 2) : 1;

  // The current item is known-broken when its URL probed as "gone".
  const currentBroken = !idle && state.videoUrl !== null && collectionHealth?.items[state.videoUrl] === "gone";

  return (
    <div className={cn("flex h-[100dvh] w-full flex-col overflow-hidden bg-black", !chromeShown && "cursor-none")} onMouseMove={onPointerActivity} onTouchStart={bumpChrome}>
      <div className="relative min-h-0 flex-1">
        {idle ? (
          <IdleScreen spaceName={currentSpace?.name ?? "Roomflix"} onLoadUrl={actions.setUrl} />
        ) : currentBroken ? (
          <UnavailableScreen title={title} />
        ) : kind === "image" ? (
          <PhotoPlayer
            url={state.videoUrl}
            title={state.videoTitle}
            index={state.collectionIndex}
            total={photoTotal}
            onNext={actions.collectionNext}
            onPrev={actions.collectionPrev}
          />
        ) : kind === "audio" ? (
          <div className="flex h-full w-full items-center justify-center p-4 sm:p-8">
            <div className="w-full max-w-3xl">
              <AudioPlayer
                url={state.videoUrl!}
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
            </div>
          </div>
        ) : (
          <VideoPlayer
            fill
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

        {/* Auto-hiding top chrome — exit, now-playing, watchers, library. */}
        <div className={cn("absolute inset-x-0 top-0 z-30 transition-opacity duration-300", chromeShown ? "opacity-100" : "pointer-events-none opacity-0")}>
          <TheaterTopBar
            title={title}
            contextLabel={contextLabel}
            viewers={viewers}
            connected={connected}
            onLoadUrl={actions.setUrl}
            onLibraryOpenChange={(open) => {
              chromeLocked.current = open;
              bumpChrome();
            }}
          />
        </div>
      </div>

      {/* Collection filmstrip — in-flow and collapsible, so it never
          overlaps the player's own controls. Collapse it for full-bleed. */}
      {!idle && state.collectionId && (
        <div className="max-h-[42vh] shrink-0 overflow-hidden">
          <CollectionStrip
            collection={collection}
            health={collectionHealth}
            currentIndex={state.collectionIndex}
            loop={state.collectionLoop}
            onNext={actions.collectionNext}
            onPrev={actions.collectionPrev}
            onJumpTo={actions.collectionJumpTo}
            onToggleLoop={actions.setCollectionLoop}
            onEdit={() => navigate(`/collections/${state.collectionId}`)}
          />
        </div>
      )}
    </div>
  );
}
