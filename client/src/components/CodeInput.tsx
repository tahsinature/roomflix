import { useEffect, useRef, type ClipboardEvent, type KeyboardEvent, type ChangeEvent } from "react";
import { cn } from "@/lib/utils";

// Segmented code entry. 8 boxes in two groups of 4 with a dash divider.
// Auto-advance on input, backspace jumps back, paste fills all visible
// slots from the paste buffer.
//
// Codes use our friendly alphabet (lowercase a–z minus i/l/o, plus 2-9)
// so saying them aloud over a phone call doesn't get garbled.

const LENGTH = 8;
const DASH_AFTER = 4;

// Char class accepted per slot. `digits` mode is preserved for any
// future numeric-only code surface; today only the alphanumeric form
// is in use (invite redemption).
const ALPHANUMERIC = /^[a-z0-9]$/;
const DIGITS = /^[0-9]$/;

export function CodeInput({
  value,
  onChange,
  onComplete,
  autoFocus,
  disabled,
  digitsOnly = false,
}: {
  value: string;
  onChange: (next: string) => void;
  onComplete?: (code: string) => void;
  autoFocus?: boolean;
  disabled?: boolean;
  digitsOnly?: boolean;
}) {
  const allowed = digitsOnly ? DIGITS : ALPHANUMERIC;
  // Strip-paste regex parallel to `allowed` — keep it permissive on type-
  // and-paste paths so anything off the alphabet just doesn't make it in.
  const stripPattern = digitsOnly ? /[^0-9]/g : /[^a-z0-9]/g;
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const chars = padToLength(value);

  useEffect(() => {
    if (autoFocus) refs.current[0]?.focus();
  }, [autoFocus]);

  const setChar = (i: number, ch: string) => {
    const next = chars.slice();
    next[i] = ch;
    const joined = next.join("").slice(0, LENGTH);
    onChange(joined);
    if (joined.length === LENGTH && onComplete) onComplete(joined);
  };

  const handleInput = (i: number) => (e: ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.toLowerCase();
    // The user may have pasted multiple chars into a single box — accept
    // them and spread forward. Filter to legal alphabet only.
    const cleaned = raw.replace(stripPattern, "");
    if (cleaned.length === 0) {
      setChar(i, "");
      return;
    }
    const merged = chars.slice();
    for (let k = 0; k < cleaned.length && i + k < LENGTH; k++) {
      merged[i + k] = cleaned[k]!;
    }
    const joined = merged.join("").slice(0, LENGTH);
    onChange(joined);
    const lastFilled = Math.min(i + cleaned.length, LENGTH - 1);
    refs.current[lastFilled]?.focus();
    refs.current[lastFilled]?.select();
    if (joined.length === LENGTH && onComplete) onComplete(joined);
  };

  const handleKeyDown = (i: number) => (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && chars[i] === "" && i > 0) {
      e.preventDefault();
      refs.current[i - 1]?.focus();
      setChar(i - 1, "");
      return;
    }
    if (e.key === "ArrowLeft" && i > 0) {
      e.preventDefault();
      refs.current[i - 1]?.focus();
      return;
    }
    if (e.key === "ArrowRight" && i < LENGTH - 1) {
      e.preventDefault();
      refs.current[i + 1]?.focus();
      return;
    }
    // Direct typing: if this slot already has a char, advance first so
    // the new key overwrites the next slot instead of replacing.
    if (e.key.length === 1 && allowed.test(e.key.toLowerCase()) && chars[i] !== "") {
      e.preventDefault();
      const idx = i < LENGTH - 1 ? i + 1 : i;
      setChar(idx, e.key.toLowerCase());
      refs.current[Math.min(idx + 1, LENGTH - 1)]?.focus();
    }
  };

  const handlePaste = (i: number) => (e: ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text").toLowerCase().replace(stripPattern, "");
    if (!text) return;
    e.preventDefault();
    const merged = chars.slice();
    for (let k = 0; k < text.length && i + k < LENGTH; k++) {
      merged[i + k] = text[k]!;
    }
    const joined = merged.join("").slice(0, LENGTH);
    onChange(joined);
    const last = Math.min(i + text.length, LENGTH) - 1;
    refs.current[last]?.focus();
    if (joined.length === LENGTH && onComplete) onComplete(joined);
  };

  return (
    <div className="flex items-center justify-center gap-1.5 sm:gap-2">
      {Array.from({ length: LENGTH }).map((_, i) => (
        <div key={i} className="flex items-center gap-1.5 sm:gap-2">
          <input
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="text"
            inputMode={digitsOnly ? "numeric" : "text"}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            maxLength={1}
            value={chars[i] ?? ""}
            disabled={disabled}
            onChange={handleInput(i)}
            onKeyDown={handleKeyDown(i)}
            onPaste={handlePaste(i)}
            aria-label={`Code character ${i + 1}`}
            className={cn(
              "h-12 w-9 border border-border bg-input/60 text-center font-mono text-xl uppercase text-foreground transition-colors sm:h-14 sm:w-11 sm:text-2xl",
              "focus-visible:border-accent/60 focus-visible:bg-input focus-visible:outline-none",
              "disabled:cursor-not-allowed disabled:opacity-50",
            )}
          />
          {i === DASH_AFTER - 1 && <span className="font-mono text-xl text-text-dim sm:text-2xl">-</span>}
        </div>
      ))}
    </div>
  );
}

function padToLength(s: string): string[] {
  const arr = s.slice(0, LENGTH).split("");
  while (arr.length < LENGTH) arr.push("");
  return arr;
}
