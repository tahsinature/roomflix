import { useEffect, useState } from "react";
import { Link2, MonitorPlay } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Standby screen for the theater when nothing is loaded. Ambient — space
// name + a live clock — so a basement-TV display reads as "on, nothing
// playing" rather than looking broken. Carries a URL field so a viewer
// can still start arbitrary media without leaving the surface.
export function IdleScreen({ spaceName, onLoadUrl }: { spaceName: string; onLoadUrl: (url: string) => void }) {
  const [now, setNow] = useState(() => new Date());
  const [input, setInput] = useState("");

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(t);
  }, []);

  const time = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const url = input.trim();
    if (!url) return;
    onLoadUrl(url);
    setInput("");
  };

  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center gap-7 bg-black px-6 text-center">
      <div className="absolute inset-0 opacity-60" style={{ background: "radial-gradient(720px 360px at 50% 36%, hsl(0 100% 65% / 0.12), transparent 62%)" }} aria-hidden />
      <div className="relative flex flex-col items-center gap-2.5">
        <MonitorPlay className="h-9 w-9 text-accent/80" />
        <div className="font-mono text-[11px] uppercase tracking-[0.3em] text-white/45">{spaceName}</div>
        <div className="font-mono text-6xl font-semibold tabular-nums text-white/90 sm:text-7xl">{time}</div>
        <div className="text-sm text-white/45">Nothing playing — pick from the library, or load a URL below.</div>
      </div>

      <form onSubmit={submit} className="relative flex w-full max-w-md flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-dim" />
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="https://…  video, audio, or image"
            className="pl-9"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
        </div>
        <Button type="submit" variant="accent" disabled={!input.trim()} className="h-11">
          Load
        </Button>
      </form>
    </div>
  );
}
