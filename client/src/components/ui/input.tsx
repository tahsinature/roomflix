import * as React from "react";
import { cn } from "@/lib/utils";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  // Most inputs in this app aren't credentials (display names, URLs,
  // space names, bucket settings) but 1Password / LastPass / Bitwarden
  // / Dashlane will inject their "fill me" UI anyway. Default to
  // suppressing every signal those managers respect; credential forms
  // (login, signup) opt back in with `allowAutofill`.
  allowAutofill?: boolean;
};

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, allowAutofill, autoComplete, ...rest }, ref) => {
    // autoComplete="off" is the standard signal, but it's widely
    // ignored by password managers for non-password fields. The
    // data-* attributes below are vendor-specific opt-outs each
    // manager actually honors. Together they're the most reliable
    // way to silence the fill prompts.
    const autofillAttrs: Record<string, string> = allowAutofill
      ? autoComplete !== undefined
        ? { autoComplete }
        : {}
      : {
          autoComplete: autoComplete ?? "off",
          "data-1p-ignore": "true",
          "data-lpignore": "true",
          "data-bwignore": "true",
          "data-form-type": "other",
        };
    return (
      <input
        type={type}
        ref={ref}
        className={cn(
          "flex h-11 w-full border border-border bg-input/60 px-3 py-2 font-mono text-sm text-foreground placeholder:text-text-dim transition-colors",
          "focus-visible:outline-none focus-visible:border-accent/60 focus-visible:bg-input",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...rest}
        {...autofillAttrs}
      />
    );
  },
);
Input.displayName = "Input";
