import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { ReactionEvent } from "@/auth/SessionPresence";
import { cn } from "@/lib/utils";

// One unified stream of reactions — emojis and text share the same
// bottom-left column so a viewer only has to watch one place to keep up
// with the room. Each entry fades in, holds, then fades out via the
// react-bubble animation; both kinds share the same lifespan so the
// stack feels rhythmic rather than two competing surfaces.
type Item = { kind: "emoji"; id: string; emoji: string; sender: string } | { kind: "text"; id: string; text: string; sender: string };

const LIFESPAN_MS = 6000;
// Visible cap so a burst doesn't paint the whole side of the screen.
const MAX_VISIBLE = 8;

// True when the string is nothing but emoji + variation selectors + ZWJ
// + skin-tone modifiers + whitespace. Lets us render typed / pasted
// "❤️" the same big way as a quick-bar reaction — the visual treatment
// follows the content, not the wire shape.
const EMOJI_ONLY_RE = /^[\p{Extended_Pictographic}️‍\s\u{1F3FB}-\u{1F3FF}]+$/u;
function isEmojiOnly(s: string): boolean {
  const t = s.trim();
  return t.length > 0 && EMOJI_ONLY_RE.test(t);
}

// Live reactions layer for the theater. Subscribes to the session's
// reaction stream and renders a unified ephemeral stack. The `container`
// it portals into is chosen by the caller (Watch) — the current
// fullscreen element when one is active, otherwise the theater media
// area — so reactions ride along inside fullscreen without extra logic.
// `bottomOffsetClass` lifts the stack above whatever else sits at the
// bottom (the reactions composer + Vidstack controls on a video).
export function ReactionsOverlay({
  subscribe,
  container,
  bottomOffsetClass = "bottom-4",
}: {
  subscribe: (cb: (event: ReactionEvent) => void) => () => void;
  container: HTMLElement | Element | null;
  bottomOffsetClass?: string;
}) {
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    return subscribe((event) => {
      const id = `${event.sentAt}-${Math.random().toString(36).slice(2, 8)}`;
      const sender = event.sender.name;
      // Destructure here — TS narrowing on the discriminant doesn't carry
      // into the nested setState callback below.
      const item: Item =
        event.reaction.kind === "emoji" ? { kind: "emoji", id, emoji: event.reaction.emoji, sender } : { kind: "text", id, text: event.reaction.text, sender };
      setItems((prev) => [...prev, item].slice(-MAX_VISIBLE));
      window.setTimeout(() => setItems((prev) => prev.filter((it) => it.id !== id)), LIFESPAN_MS);
    });
  }, [subscribe]);

  if (!container || items.length === 0) return null;

  return createPortal(
    <div className="pointer-events-none absolute inset-0 z-40 overflow-hidden">
      {/* One stream — newest at the bottom (flex-col-reverse). Emojis
          render bigger to keep the festive feel; text uses a standard
          chat bubble. Both share the react-bubble animation. */}
      <div className={cn("absolute left-4 flex max-w-[min(85%,26rem)] flex-col-reverse gap-2 sm:left-6", bottomOffsetClass)}>
        {items.map((it) => {
          // Treat a text reaction that's all emoji as a quick-react —
          // same big visual as a tap on the emoji bar, just typed.
          const asEmoji = it.kind === "emoji" ? it.emoji : isEmojiOnly(it.text) ? it.text.trim() : null;
          if (asEmoji !== null) {
            return (
              <div
                key={it.id}
                className="flex animate-react-bubble items-center gap-3 border border-white/15 bg-black/70 px-3 py-1.5 shadow-[0_8px_24px_-8px_rgba(0,0,0,0.7)] backdrop-blur-md"
              >
                <span className="text-3xl drop-shadow-[0_2px_8px_rgba(0,0,0,0.85)] sm:text-4xl">{asEmoji}</span>
                <span className="truncate font-mono text-[11px] uppercase tracking-[0.16em] text-white/55">{it.sender}</span>
              </div>
            );
          }
          return (
            <div key={it.id} className="animate-react-bubble border border-white/15 bg-black/75 px-3 py-2 shadow-[0_8px_24px_-8px_rgba(0,0,0,0.7)] backdrop-blur-md">
              <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/45">{it.sender}</div>
              <div className="break-words text-sm text-white/95">{(it as { text: string }).text}</div>
            </div>
          );
        })}
      </div>
    </div>,
    container,
  );
}
