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

  return (
    <div className="flex flex-col gap-1.5 border-t border-white/10 bg-black/70 px-3 py-2 backdrop-blur sm:px-4">
      {attachedMoment && (
        <MomentChip
          moment={attachedMoment}
          onClear={onClearMoment}
        />
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        <div className="flex shrink-0 items-center gap-1">
          {QUICK_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => onSend({ kind: "emoji", emoji })}
              aria-label={`React with ${emoji}`}
              title={`React ${emoji}`}
              className="flex h-8 w-8 items-center justify-center border border-white/10 bg-white/[0.04] text-base transition hover:scale-105 hover:border-white/30 hover:bg-white/10 active:scale-95 sm:h-9 sm:w-9 sm:text-lg"
            >
              {emoji}
            </button>
          ))}
        </div>

        <form onSubmit={submitText} className="flex min-w-0 flex-1 items-center gap-1.5">
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={attachedMoment ? "Add a note (optional)…" : "Say something…"}
            maxLength={MAX_TEXT_LEN}
            aria-label="Send a message"
            className="h-8 min-w-0 flex-1 border border-white/10 bg-black/50 px-2.5 text-sm text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none sm:h-9"
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
                  ? "flex h-8 w-8 shrink-0 items-center justify-center border border-accent/60 bg-accent/15 text-accent transition hover:border-accent hover:bg-accent/20 sm:h-9 sm:w-9"
                  : "flex h-8 w-8 shrink-0 items-center justify-center border border-white/10 bg-white/[0.04] text-white/70 transition hover:border-white/30 hover:text-white sm:h-9 sm:w-9"
              }
            >
              <Clock className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="submit"
            onPointerDown={(e) => e.preventDefault()}
            disabled={!text.trim() && !attachedMoment}
            aria-label="Send message"
            className="flex h-8 w-8 shrink-0 items-center justify-center border border-white/10 bg-white/[0.04] text-white/70 transition hover:border-accent/50 hover:text-white disabled:opacity-30 sm:h-9 sm:w-9"
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </form>
      </div>
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
