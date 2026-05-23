import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { Collection, CollectionHealth } from "@shared/protocol";
import { VideoPlayer } from "@/components/player/VideoPlayer";
import { AudioPlayer } from "@/components/player/AudioPlayer";
import { PhotoPlayer } from "@/components/player/PhotoPlayer";
import { CollectionStrip } from "@/components/CollectionStrip";
import { TheaterTopBar } from "@/components/theater/TheaterTopBar";
import { IdleScreen } from "@/components/theater/IdleScreen";
import { UnavailableScreen } from "@/components/theater/UnavailableScreen";
import { ReactionsOverlay } from "@/components/theater/ReactionsOverlay";
import { ReactionBar } from "@/components/theater/ReactionBar";
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
  const { state, viewers, serverTime, connected, stateLoaded, actions, subscribeReactions } = useSessionSync();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [collection, setCollection] = useState<Collection | null>(null);
  const [collectionHealth, setCollectionHealth] = useState<CollectionHealth | null>(null);
  // Captured via callback ref — the bar + reactions overlay portal into
  // either this (non-fullscreen) or the current fullscreen element.
  const [mediaArea, setMediaArea] = useState<HTMLElement | null>(null);
  // Tracks the current fullscreen element. When set, the bar + overlay
  // portal into it so they ride along inside fullscreen — no need to
  // exit fullscreen just to react.
  const [fsEl, setFsEl] = useState<Element | null>(typeof document === "undefined" ? null : document.fullscreenElement);
  useEffect(() => {
    const onFs = () => setFsEl(document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);
  // Lets the in-player react button focus the composer in the chrome.
  const composerInputRef = useRef<HTMLInputElement | null>(null);

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
  // Multiple things can hold the chrome open — the library dropdown, the
  // pinned reaction composer. Tracking them per-source means closing one
  // doesn't accidentally release the others.
  const chromeLocked = useRef({ library: false, composer: false });

  const scheduleHide = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      // Re-check rather than hide while any lock is engaged.
      if (chromeLocked.current.library || chromeLocked.current.composer) scheduleHide();
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

  // Composer pin: while pinned, the bar stays visible regardless of the
  // chrome's auto-hide. Driven by the in-player react button, the "/"
  // hotkey, and explicit dismiss (Escape / click outside).
  const [composerPinned, setComposerPinned] = useState(false);
  const barWrapperRef = useRef<HTMLDivElement | null>(null);

  // Sync the pin to the chrome lock so auto-hide leaves the bar alone
  // while it's open. Restarts the hide timer on unpin.
  useEffect(() => {
    chromeLocked.current.composer = composerPinned;
    if (!composerPinned) bumpChrome();
  }, [composerPinned, bumpChrome]);

  // Open + focus the composer. Used by the in-player smile button and the
  // "/" hotkey. The bar portals into the fullscreen element when one is
  // active, so we no longer exit fullscreen to compose — the user can
  // keep watching at full size and still type.
  const openComposer = useCallback(() => {
    setComposerPinned(true);
    bumpChrome();
    requestAnimationFrame(() => composerInputRef.current?.focus());
  }, [bumpChrome]);

  // Hotkey: "/" opens the composer (chat tradition). Escape closes it
  // when pinned — captured before Watch's exit-to-library Escape so the
  // first press dismisses the bar, the next leaves the theater.
  useEffect(() => {
    if (idle) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/") {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
        e.preventDefault();
        void openComposer();
      } else if (e.key === "Escape" && composerPinned) {
        e.preventDefault();
        e.stopImmediatePropagation();
        setComposerPinned(false);
        (document.activeElement as HTMLElement | null)?.blur?.();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [idle, composerPinned, openComposer]);

  // Click outside the bar wrapper dismisses the pinned composer. Listener
  // only mounts while pinned, so the opening click can't immediately
  // close what it just opened.
  useEffect(() => {
    if (!composerPinned) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!barWrapperRef.current?.contains(e.target as Node | null)) {
        setComposerPinned(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [composerPinned]);

  return (
    <div className={cn("flex h-[100dvh] w-full flex-col overflow-hidden bg-black", !chromeShown && "cursor-none")} onMouseMove={onPointerActivity} onTouchStart={bumpChrome}>
      <div ref={setMediaArea} className="relative min-h-0 flex-1">
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
            onReact={openComposer}
          />
        )}

        {/* Live reactions — portals to the fullscreen element when a
            video is fullscreen so emojis ride along with the picture. */}
        {!idle && (
        <ReactionsOverlay
          subscribe={subscribeReactions}
          container={fsEl ?? mediaArea}
          bottomOffsetClass={kind === "video" ? "bottom-36" : "bottom-16"}
        />
      )}

      {/* Reactions composer — portaled into the fullscreen element when
          one is active, otherwise into the theater media area, so it's
          reachable in fullscreen without exiting. Positioned as an
          absolute overlay so toggling it doesn't shift the video. */}
      {!idle &&
        (fsEl ?? mediaArea) &&
        createPortal(
          <div
            ref={barWrapperRef}
            // Pin while focus lives anywhere in the bar (input or
            // buttons). Catches the case where the user just clicks the
            // input directly — without that, the chrome's auto-hide
            // would fade the bar mid-sentence.
            onFocus={() => setComposerPinned(true)}
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setComposerPinned(false);
            }}
            className={cn(
              "absolute inset-x-0 z-40 transition-opacity duration-300",
              // Sit above the video's own controls when there are any.
              kind === "video" ? "bottom-20" : "bottom-0",
              chromeShown || composerPinned ? "opacity-100" : "pointer-events-none opacity-0",
            )}
          >
            <ReactionBar ref={composerInputRef} onSend={actions.sendReaction} />
          </div>,
          (fsEl ?? mediaArea)!,
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
              chromeLocked.current.library = open;
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
