import { useLayoutEffect } from "react";
import { useLocation } from "react-router-dom";

const STORAGE_KEY = "roomflix.scroll-positions.v1";
const MAX_SCROLL_ENTRIES = 100;
const scrollPositions = loadScrollPositions();

/** Restores Roomflix's custom app scroller for Back/Forward navigation. */
export function AppScrollRestoration({ containerId }: { containerId: string }) {
  const { key: locationKey } = useLocation();

  useLayoutEffect(() => {
    const scroller = document.getElementById(containerId);
    if (!scroller) return;

    const target = scrollPositions.get(locationKey) ?? 0;
    let restorationPending = target > 0;
    let animationFrame = 0;
    let resizeObserver: ResizeObserver | null = null;
    let mutationObserver: MutationObserver | null = null;

    const rememberPosition = () => {
      if (restorationPending) return;
      scrollPositions.delete(locationKey);
      scrollPositions.set(locationKey, scroller.scrollTop);
      trimScrollPositions();
    };

    const stopRestoring = () => {
      restorationPending = false;
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
      resizeObserver = null;
      mutationObserver = null;
      window.cancelAnimationFrame(animationFrame);
    };

    const restoreWhenReady = () => {
      if (!restorationPending) return;
      const maximumScrollTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
      if (target > maximumScrollTop + 1) return;
      scroller.scrollTo({ top: target, behavior: "auto" });
      stopRestoring();
    };

    const observePage = () => {
      resizeObserver?.disconnect();
      resizeObserver = new ResizeObserver(restoreWhenReady);
      for (const child of scroller.children) resizeObserver.observe(child);
      restoreWhenReady();
    };

    const cancelForUserInput = () => stopRestoring();

    scroller.scrollTo({ top: 0, behavior: "auto" });
    if (restorationPending) {
      mutationObserver = new MutationObserver(observePage);
      mutationObserver.observe(scroller, { childList: true });
      observePage();
      animationFrame = window.requestAnimationFrame(restoreWhenReady);
    }

    scroller.addEventListener("scroll", rememberPosition, { passive: true });
    scroller.addEventListener("wheel", cancelForUserInput, { passive: true });
    scroller.addEventListener("touchstart", cancelForUserInput, { passive: true });
    scroller.addEventListener("pointerdown", cancelForUserInput, { passive: true });
    window.addEventListener("keydown", cancelForUserInput);
    window.addEventListener("pagehide", persistScrollPositions);

    return () => {
      rememberPosition();
      persistScrollPositions();
      stopRestoring();
      scroller.removeEventListener("scroll", rememberPosition);
      scroller.removeEventListener("wheel", cancelForUserInput);
      scroller.removeEventListener("touchstart", cancelForUserInput);
      scroller.removeEventListener("pointerdown", cancelForUserInput);
      window.removeEventListener("keydown", cancelForUserInput);
      window.removeEventListener("pagehide", persistScrollPositions);
    };
  }, [containerId, locationKey]);

  return null;
}

function loadScrollPositions(): Map<string, number> {
  if (typeof window === "undefined") return new Map();
  try {
    const stored = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) ?? "[]") as unknown;
    if (!Array.isArray(stored)) return new Map();
    return new Map(
      stored.filter(
        (entry): entry is [string, number] => Array.isArray(entry) && typeof entry[0] === "string" && typeof entry[1] === "number" && Number.isFinite(entry[1]),
      ),
    );
  } catch {
    return new Map();
  }
}

function persistScrollPositions() {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...scrollPositions]));
  } catch {
    // Navigation still works when storage is unavailable.
  }
}

function trimScrollPositions() {
  while (scrollPositions.size > MAX_SCROLL_ENTRIES) {
    const oldestKey = scrollPositions.keys().next().value;
    if (typeof oldestKey !== "string") break;
    scrollPositions.delete(oldestKey);
  }
}
