import { forwardRef, useState, type FormEvent } from "react";
import { Send } from "lucide-react";
import type { ReactionContent } from "@shared/protocol";

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
export const ReactionBar = forwardRef<HTMLInputElement, { onSend: (content: ReactionContent) => void }>(function ReactionBar({ onSend }, inputRef) {
  const [text, setText] = useState("");

  const submitText = (e: FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    onSend({ kind: "text", text: t });
    setText("");
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5 border-t border-white/10 bg-black/70 px-3 py-2 backdrop-blur sm:px-4">
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
          placeholder="Say something…"
          maxLength={MAX_TEXT_LEN}
          aria-label="Send a message"
          className="h-8 min-w-0 flex-1 border border-white/10 bg-black/50 px-2.5 text-sm text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none sm:h-9"
        />
        <button
          type="submit"
          onPointerDown={(e) => e.preventDefault()}
          disabled={!text.trim()}
          aria-label="Send message"
          className="flex h-8 w-8 shrink-0 items-center justify-center border border-white/10 bg-white/[0.04] text-white/70 transition hover:border-accent/50 hover:text-white disabled:opacity-30 sm:h-9 sm:w-9"
        >
          <Send className="h-3.5 w-3.5" />
        </button>
      </form>
    </div>
  );
});
