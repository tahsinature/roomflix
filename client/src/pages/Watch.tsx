import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { Collection, CollectionHealth } from "@shared/protocol";
import { VideoPlayer } from "@/components/player/VideoPlayer";
import { AudioPlayer } from "@/components/player/AudioPlayer";
import { PhotoPlayer } from "@/components/player/PhotoPlayer";
import { CollectionStrip } from "@/components/CollectionStrip";
import { CollectionPanel } from "@/components/CollectionPanel";
import { TheaterTopBar } from "@/components/theater/TheaterTopBar";
import { IdleScreen } from "@/components/theater/IdleScreen";
import { UnavailableScreen } from "@/components/theater/UnavailableScreen";
import { ReactionsOverlay } from "@/components/theater/ReactionsOverlay";
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
  const navigate = useNavigate();
  const { state, viewers, serverTime, connected, stateLoaded, actions, subscribeReactions, subscribeChat } = useSessionSync();
  // Server-clock skew, captured once per serverTime push, used by the
  // "attach scene" capture to compute the room's currently-playing time
  // without round-tripping through the player ref.
  const skewRef = useRef(0);
  useEffect(() => {
    skewRef.current = Date.now() - serverTime;
  }, [serverTime]);
  // Sidebar that hosts /remote inside the theater. State persists across
  // refreshes so a viewer who likes the split layout keeps it. Driven
  // by the in-player Remote launcher's "Side panel" option.
  const [remoteSidebarOpen, setRemoteSidebarOpen] = useState<boolean>(() => {
    try {
      return localStorage.getItem("roomflix:remote-sidebar") === "1";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("roomflix:remote-sidebar", remoteSidebarOpen ? "1" : "0");
    } catch {
      /* private mode / disabled storage */
    }
  }, [remoteSidebarOpen]);

  // Collection filmstrip layout — vertical (left side panel) by
  // default; "bottom" flips back to the horizontal strip. The panel's
  // header has a "move to bottom" button; the strip's header has the
  // inverse. Persisted so a viewer's preference survives reloads.
  const [collectionLayout, setCollectionLayout] = useState<"bottom" | "side">(() => {
    try {
      return localStorage.getItem("roomflix:collection-layout") === "bottom" ? "bottom" : "side";
    } catch {
      return "side";
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("roomflix:collection-layout", collectionLayout);
    } catch {
      /* ignore */
    }
  }, [collectionLayout]);

  const openRemote = useCallback(
    (mode: "sidebar" | "newWindow" | "sameWindow") => {
      if (mode === "sidebar") {
        setRemoteSidebarOpen((v) => !v);
        return;
      }
      if (mode === "newWindow") {
        // Detached companion popup — 420×820 is roomy enough for the
        // chat thread + composer + controls on most laptops, and a
        // named window so a second click reuses the same popup.
        window.open("/remote", "roomflix-remote", "popup,width=420,height=820,resizable=yes");
        return;
      }
      navigate("/remote");
    },
    [navigate],
  );

  const [searchParams, setSearchParams] = useSearchParams();
  const [collection, setCollection] = useState<Collection | null>(null);
  const [collectionHealth, setCollectionHealth] = useState<CollectionHealth | null>(null);
  // Captured via callback ref — the reactions overlay portal points
  // into either this (non-fullscreen) or the current fullscreen element.
  const [mediaArea, setMediaArea] = useState<HTMLElement | null>(null);
  // Fullscreen targets the outer row (player + sidebar), not just the
  // video element, so the sidebar persists when the user goes full-
  // screen. The ref points at the row; the toggle below requests
  // fullscreen on it.
  const fullscreenRootRef = useRef<HTMLDivElement | null>(null);
  // Tracks the current fullscreen element. When set, the overlay
  // portals into it so chat bubbles ride along inside fullscreen.
  const [fsEl, setFsEl] = useState<Element | null>(typeof document === "undefined" ? null : document.fullscreenElement);
  useEffect(() => {
    const onFs = () => setFsEl(document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);
  const isFullscreen = fsEl !== null;
  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {
        /* user cancelled / unsupported */
      });
    } else {
      fullscreenRootRef.current?.requestFullscreen().catch(() => {
        /* permission denied */
      });
    }
  }, []);

  // Intercept the "f" key BEFORE Vidstack's document-level shortcut
  // handler runs, so the keyboard path matches the button path: fullscreen
  // targets the row (sidebar stays visible) instead of just the media
  // element. Capture phase + stopImmediatePropagation prevents Vidstack
  // from also reacting to the same keystroke.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "f" && e.key !== "F") return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      toggleFullscreen();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [toggleFullscreen]);

  // "c" toggles the remote sidebar — the panel is primarily for chat
  // (text + reactions both flow through it), so the mnemonic fits
  // better than "r". Same intercept pattern as "f" so the shortcut
  // doesn't compete with any document-level handler.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "c" && e.key !== "C") return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      setRemoteSidebarOpen((v) => !v);
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, []);

  // Bridge for keystrokes fired inside the /remote iframe. Iframes
  // capture their own keydowns and the host never sees them — the
  // iframe posts the key here and we dispatch the same shortcuts as
  // the host-level listeners above.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      const data = e.data as { source?: string; key?: string } | null;
      if (!data || data.source !== "roomflix:remote") return;
      if (data.key === "c") setRemoteSidebarOpen((v) => !v);
      else if (data.key === "f") toggleFullscreen();
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [toggleFullscreen]);

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
  const chromeLocked = useRef({ library: false, watchers: false });

  const scheduleHide = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      // Re-check rather than hide while any lock is engaged.
      if (chromeLocked.current.library || chromeLocked.current.watchers) scheduleHide();
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
    <div
      ref={fullscreenRootRef}
      className={cn("flex h-[100dvh] w-full overflow-hidden bg-black", !chromeShown && "cursor-none")}
      onMouseMove={onPointerActivity}
      onTouchStart={bumpChrome}
    >
      {/* Vertical filmstrip — only renders when a collection is loaded
          AND the user has flipped the layout to "side". */}
      {!idle && state.collectionId && collectionLayout === "side" && (
        <CollectionPanel
          collection={collection}
          health={collectionHealth}
          currentIndex={state.collectionIndex}
          loop={state.collectionLoop}
          onNext={actions.collectionNext}
          onPrev={actions.collectionPrev}
          onJumpTo={actions.collectionJumpTo}
          onToggleLoop={actions.setCollectionLoop}
          onEdit={state.collectionId ? () => navigate(`/collections/${state.collectionId}`) : undefined}
          onMoveToBottom={() => setCollectionLayout("bottom")}
        />
      )}

      {/* Content column — media + collection strip. The sidebars (when
          open) sit beside this whole column so the strip also shrinks
          to leave room. */}
      <div className="flex min-w-0 flex-1 flex-col">
      <div ref={setMediaArea} className="relative min-h-0 flex-1">
        {idle ? (
          <IdleScreen spaceName={currentSpace?.name ?? "Roomflix"} />
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
                onDurationKnown={actions.setDuration}
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
            onDurationKnown={actions.setDuration}
            onOpenRemote={openRemote}
            remoteSidebarOpen={remoteSidebarOpen}
            // Custom fullscreen target so the sidebar stays visible.
            // Vidstack's own FullscreenButton would fullscreen the video
            // element alone and clip out the sidebar.
            onToggleFullscreen={toggleFullscreen}
            isFullscreen={isFullscreen}
            loadingIncoming={incomingPending}
          />
        )}

        {/* Live reactions — portals to the fullscreen element when a
            video is fullscreen so emojis ride along with the picture. */}
        {!idle && (
          <ReactionsOverlay
            subscribe={subscribeReactions}
            subscribeChat={subscribeChat}
            container={fsEl ?? mediaArea}
            bottomOffsetClass={kind === "video" ? "bottom-36" : "bottom-16"}
            onJump={actions.jumpTo}
          />
        )}

        {/* Composer intentionally lives on /remote, not here. The
            theater is for watching; typing happens on the companion. */}

        {/* Auto-hiding top chrome — exit, now-playing, watchers, library. */}
        <div className={cn("absolute inset-x-0 top-0 z-30 transition-opacity duration-300", chromeShown ? "opacity-100" : "pointer-events-none opacity-0")}>
          <TheaterTopBar
            title={title}
            contextLabel={contextLabel}
            viewers={viewers}
            connected={connected}
            onLoadUrl={actions.setUrl}
            // Video has its own in-player Remote launcher in the
            // control bar. Audio + photo have no player chrome to
            // dock it into, so the top bar surfaces a launcher there.
            onOpenRemote={kind !== "video" ? openRemote : undefined}
            remoteSidebarOpen={remoteSidebarOpen}
            onLibraryOpenChange={(open) => {
              chromeLocked.current.library = open;
              bumpChrome();
            }}
            onWatchersOpenChange={(open) => {
              chromeLocked.current.watchers = open;
              bumpChrome();
            }}
          />
        </div>
      </div>

      {/* Collection filmstrip — bottom horizontal layout. Hidden when
          the user has pivoted the filmstrip to the left side panel. */}
      {!idle && state.collectionId && collectionLayout === "bottom" && (
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
            onMoveToSide={() => setCollectionLayout("side")}
          />
        </div>
      )}
      </div>{/* /content column */}

      {remoteSidebarOpen && <RemoteSidebar />}
    </div>
  );
}

// Side dock host for /remote. Iframes the route so we get the full
// chat + composer + progress + controls UI without a refactor; the
// embedded layout in Remote.tsx (and AuthedLayout) is iframe-aware and
// drops the AppNav + "Open here" link automatically. Hidden on
// narrow widths — the player already fights for room there. Closing
// the panel happens via the in-player Remote launcher or the "c"
// keyboard shortcut, so no separate close affordance is needed here.
function RemoteSidebar() {
  return (
    <aside className="relative hidden h-full w-[380px] shrink-0 border-l border-white/10 bg-black md:block">
      <iframe
        title="Remote companion"
        src="/remote"
        className="h-full w-full border-0"
        // Same-origin iframe — auth cookie + WS just work.
      />
    </aside>
  );
}
