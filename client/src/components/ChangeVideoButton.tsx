import { useEffect, useRef, useState } from "react";
import { Replace } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Props = {
  currentUrl: string | null;
  onApply: (url: string) => void;
};

export function ChangeVideoButton({ currentUrl, onApply }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  // Pre-fill with the current URL each time the popover opens, so the user
  // can copy it out or edit-in-place rather than retyping.
  useEffect(() => {
    if (open) setDraft(currentUrl ?? "");
  }, [open, currentUrl]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", onEsc);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const url = draft.trim();
    if (!url || url === currentUrl) {
      setOpen(false);
      return;
    }
    onApply(url);
    setOpen(false);
  };

  const unchanged = !draft.trim() || draft.trim() === currentUrl;

  return (
    <div ref={ref} className="relative">
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-label="Change video"
        onClick={() => setOpen((o) => !o)}
      >
        <Replace className="h-3.5 w-3.5" />
        <span className="hidden lg:inline">Change video</span>
      </Button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-white/10 bg-card/95 p-3 shadow-2xl shadow-black/40 backdrop-blur">
          <form onSubmit={submit} className="space-y-2">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">
              Change video
            </div>
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Paste a public video URL"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              autoFocus
            />
            <div className="flex justify-end gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="accent"
                size="sm"
                disabled={unchanged}
              >
                Apply
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
