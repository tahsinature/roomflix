import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Clock } from "lucide-react";
import type { ChatMessage, ChatMoment } from "@shared/protocol";
import type { ReactionEvent } from "@/auth/SessionPresence";
import { cn } from "@/lib/utils";

// One unified stream of reactions — emojis and text share the same
// bottom-left column so a viewer only has to watch one place to keep up
// with the room. Each entry fades in, holds, then fades out via the
// react-bubble animation; both kinds share the same lifespan so the
// stack feels rhythmic rather than two competing surfaces.
type Item =
  | { kind: "emoji"; id: string; emoji: string; sender: string }
  | { kind: "text"; id: string; text: string; sender: string; moment: ChatMoment | null };

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
  subscribeChat,
  container,
  bottomOffsetClass = "bottom-4",
  onJump,
}: {
  subscribe: (cb: (event: ReactionEvent) => void) => () => void;
  // Chat messages also surface as ephemeral bubbles here so the theater
  // audience sees what's being said without leaving the picture. They
  // still persist into the chat history on /remote — this is just the
  // live overlay layer.
  subscribeChat: (cb: (message: ChatMessage) => void) => () => void;
  container: HTMLElement | Element | null;
  bottomOffsetClass?: string;
  // Tapping a moment chip on a bubble asks the room to jump there. Optional
  // — when omitted, chips are display-only.
  onJump?: (moment: ChatMoment) => void;
}) {
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    return subscribe((event) => {
      const id = `${event.sentAt}-${Math.random().toString(36).slice(2, 8)}`;
      const sender = event.sender.name;
      if (event.reaction.kind !== "emoji") return; // text now travels via chat
      const item: Item = { kind: "emoji", id, emoji: event.reaction.emoji, sender };
      setItems((prev) => [...prev, item].slice(-MAX_VISIBLE));
      window.setTimeout(() => setItems((prev) => prev.filter((it) => it.id !== id)), LIFESPAN_MS);
    });
  }, [subscribe]);

  useEffect(() => {
    return subscribeChat((msg) => {
      const item: Item = { kind: "text", id: msg.id, text: msg.text, sender: msg.senderName, moment: msg.moment };
      setItems((prev) => [...prev, item].slice(-MAX_VISIBLE));
      window.setTimeout(() => setItems((prev) => prev.filter((it) => it.id !== msg.id)), LIFESPAN_MS);
    });
  }, [subscribeChat]);

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
          const text = it as Extract<Item, { kind: "text" }>;
          return (
            <div key={it.id} className="pointer-events-auto animate-react-bubble border border-white/15 bg-black/75 px-3 py-2 shadow-[0_8px_24px_-8px_rgba(0,0,0,0.7)] backdrop-blur-md">
              <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/45">{text.sender}</div>
              {text.text && <div className="break-words text-sm text-white/95">{text.text}</div>}
              {text.moment && (
                <button
                  type="button"
                  onClick={() => onJump?.(text.moment!)}
                  disabled={!onJump}
                  className="mt-1.5 inline-flex items-center gap-1.5 border border-accent/40 bg-accent/[0.08] px-2 py-0.5 text-[11px] text-accent transition hover:border-accent hover:bg-accent/15 disabled:opacity-70"
                  title="Jump to this scene"
                >
                  <Clock className="h-3 w-3" />
                  <span className="max-w-[180px] truncate">{text.moment.mediaTitle || "Scene"}</span>
                  {text.moment.currentTime > 0.5 && <span className="font-mono text-[10px] text-accent/80">{formatTime(text.moment.currentTime)}</span>}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>,
    container,
  );
}

function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}
