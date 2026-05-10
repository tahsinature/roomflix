import type { Subtitle, VideoHealth } from "@shared/protocol";
import { cn } from "@/lib/utils";

// Small "CC" pill rendered next to a video title to signal subtitles are
// attached. Hidden when none. Color carries health: cyan when fine, coral
// when at least one subtitle URL is unreachable.
export function SubtitleBadge({ subtitles, health }: { subtitles: Subtitle[]; health?: VideoHealth }) {
  if (subtitles.length === 0) return null;
  const alert = !!health?.subtitles && subtitles.some((s) => health.subtitles[s.id] === "gone");
  const label = alert ? "Subtitles attached — at least one URL is unreachable" : `Subtitles attached (${subtitles.length})`;
  return (
    <span
      title={label}
      aria-label={label}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
        alert ? "border-accent/30 bg-accent/10 text-accent" : "border-cyan/30 bg-cyan/10 text-cyan",
      )}
    >
      CC
      {subtitles.length > 1 && <span className="opacity-80">·{subtitles.length}</span>}
    </span>
  );
}
