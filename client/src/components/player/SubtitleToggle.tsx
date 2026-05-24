import { useEffect, useRef, useState } from "react";
import { Captions } from "lucide-react";
import type { Subtitle } from "@shared/protocol";
import { cn } from "@/lib/utils";

const ICON_BTN =
  "inline-flex h-9 w-9 items-center justify-center text-white/90 transition hover:bg-white/10 active:scale-95 outline-none focus:outline-none focus-visible:outline-none [&:focus]:shadow-none [&:focus-visible]:shadow-none";

const RADIO_ITEM = "flex w-full cursor-pointer items-center justify-between gap-2 px-2.5 py-1.5 text-left text-sm text-white/85 transition hover:bg-white/[0.08]";

type Props = {
  subtitles: Subtitle[];
  activeId: string | null;
  onSelect: (id: string | null) => void;
};

export function SubtitleToggle({ subtitles, activeId, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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

  // Hide entirely when there's nothing to toggle.
  if (subtitles.length === 0) return null;

  const pick = (id: string | null) => {
    onSelect(id);
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <button type="button" className={cn(ICON_BTN, activeId && "text-accent")} aria-label="Subtitles" title="Subtitles" onClick={() => setOpen((o) => !o)}>
        <Captions className="h-5 w-5" />
      </button>
      {open && (
        <div className="absolute bottom-full right-0 z-50 mb-2 min-w-[14rem] origin-bottom-right border border-white/10 bg-[#16181f]/95 p-1.5 text-sm shadow-[0_24px_60px_-12px_rgba(0,0,0,0.85)] backdrop-blur-xl">
          <div className="px-2 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/40">Subtitles</div>
          <button type="button" className={cn(RADIO_ITEM, activeId === null && "bg-accent/15 text-white")} onClick={() => pick(null)}>
            <span>Off</span>
            {activeId === null && <Dot />}
          </button>
          {subtitles.map((s) => (
            <button key={s.id} type="button" className={cn(RADIO_ITEM, activeId === s.id && "bg-accent/15 text-white")} onClick={() => pick(s.id)}>
              <span className="flex min-w-0 flex-col">
                <span className="truncate">{s.label}</span>
                {s.lang && <span className="text-[10px] uppercase tracking-wider text-white/40">{s.lang}</span>}
              </span>
              {activeId === s.id && <Dot />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Dot() {
  return <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />;
}
