import { forwardRef, useState, type FormEvent } from "react";
import { Clock, Send, X } from "lucide-react";
import type { ChatMoment, ReactionContent } from "@shared/protocol";

// Mirrors the server allow-list — drift here and the server silently
// drops the reaction.
const QUICK_EMOJIS = ["😂", "❤️", "🔥", "😮", "👏", "😭", "🍿", "👀"];
const MAX_TEXT_LEN = 140;

// Composer dock for the theater chrome — one-tap quick reactions and a
// short text field. Submitting never pauses playback (reactions are an
// ephemeral WS fan-out). The text input is forwardRef so the theater can
// focus it from the "/" hotkey + the in-player react button. Emoji /
// send buttons preventDefault on pointerdown so they don't steal focus
// from the input — you can keep typing after firing a quick react.
//
// Optional moment chip — when the parent wires `onAttachMoment`, a small
// clock button appears that captures the current playback position into
// `attachedMoment`. The captured moment renders as a chip above the
// input until sent (bundled into the same submit as the text) or cleared.
export const ReactionBar = forwardRef<
  HTMLInputElement,
  {
    onSend: (content: ReactionContent | { kind: "text"; text: string }) => void;
    attachedMoment?: ChatMoment | null;
    onAttachMoment?: () => void;
    onClearMoment?: () => void;
  }
>(function ReactionBar({ onSend, attachedMoment, onAttachMoment, onClearMoment }, inputRef) {
  const [text, setText] = useState("");
  const canAttach = typeof onAttachMoment === "function";

  const submitText = (e: FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    // Allow a moment-only send (no text) when a moment is attached.
    if (!t && !attachedMoment) return;
    onSend({ kind: "text", text: t });
    setText("");
  };

  const canSend = !!text.trim() || !!attachedMoment;

  return (
    <div className="flex flex-col gap-2 border-t border-white/[0.06] bg-black/70 px-3 py-2.5 backdrop-blur sm:px-4">
      {attachedMoment && (
        <MomentChip
          moment={attachedMoment}
          onClear={onClearMoment}
        />
      )}

      {/* Emoji rail — 8 equal columns so the quick reactions distribute
          evenly across whatever width the surface has. Borderless cells
          with a hover lift read calmer than the old bordered grid;
          aspect-square keeps each cell a clean target. */}
      <div className="grid grid-cols-8 gap-1">
        {QUICK_EMOJIS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => onSend({ kind: "emoji", emoji })}
            aria-label={`React with ${emoji}`}
            className="flex aspect-square items-center justify-center rounded-md text-lg transition hover:scale-110 hover:bg-white/[0.07] active:scale-95"
          >
            <span aria-hidden>{emoji}</span>
          </button>
        ))}
      </div>

      <form onSubmit={submitText} className="flex w-full items-center gap-1.5">
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={attachedMoment ? "Add a note (optional)…" : "Say something…"}
          maxLength={MAX_TEXT_LEN}
          aria-label="Send a message"
          className="h-9 min-w-0 flex-1 rounded-md border border-white/[0.08] bg-white/[0.03] px-3 text-sm text-white placeholder:text-white/35 transition focus:border-accent/45 focus:bg-black/40 focus:outline-none"
        />
        {canAttach && (
          <button
            type="button"
            onPointerDown={(e) => e.preventDefault()}
            onClick={onAttachMoment}
            aria-label="Attach current scene"
            title={attachedMoment ? "Replace attached scene" : "Attach current scene"}
            className={
              attachedMoment
                ? "flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-accent/55 bg-accent/15 text-accent transition hover:border-accent hover:bg-accent/20"
                : "flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-white/55 transition hover:bg-white/[0.07] hover:text-white"
            }
          >
            <Clock className="h-4 w-4" />
          </button>
        )}
        <button
          type="submit"
          onPointerDown={(e) => e.preventDefault()}
          disabled={!canSend}
          aria-label="Send message"
          title="Send"
          className={
            canSend
              ? "flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground transition hover:bg-accent-bright"
              : "flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-white/30 disabled:cursor-not-allowed"
          }
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
});

function MomentChip({ moment, onClear }: { moment: ChatMoment; onClear?: () => void }) {
  const showTime = moment.currentTime > 0.5;
  return (
    <div className="flex items-center gap-2 self-start border border-accent/40 bg-accent/[0.08] px-2 py-1 text-xs text-accent">
      <Clock className="h-3 w-3 shrink-0" />
      <span className="max-w-[220px] truncate" title={moment.mediaTitle || "Scene"}>
        {moment.mediaTitle || "Scene"}
      </span>
      {showTime && <span className="font-mono text-[10px] text-accent/80">{formatTimestamp(moment.currentTime)}</span>}
      {onClear && (
        <button
          type="button"
          onClick={onClear}
          aria-label="Remove attached scene"
          className="ml-0.5 flex h-4 w-4 items-center justify-center text-accent/70 transition hover:text-accent"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

function formatTimestamp(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}
