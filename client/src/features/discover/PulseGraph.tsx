import { LockKeyhole } from "lucide-react";
import { PULSE_SIGNALS, type PulseSignalKey } from "./pulse-data";

const WIDTH = 720;
const HEIGHT = 226;
const CHART_START = 112;
const CHART_END = 704;
const ROW_HEIGHT = 48;

const SIGNAL_STYLES: Record<PulseSignalKey, { stroke: string; glow: string }> = {
  tension: { stroke: "hsl(var(--accent))", glow: "hsl(var(--accent) / .18)" },
  fear: { stroke: "rgb(252 211 77)", glow: "rgb(252 211 77 / .14)" },
  intimacy: { stroke: "hsl(var(--cyan))", glow: "hsl(var(--cyan) / .14)" },
  pace: { stroke: "hsl(var(--foreground))", glow: "hsl(var(--foreground) / .1)" },
};

function graphPoints(values: number[], rowIndex: number): string {
  const rowTop = 22 + rowIndex * ROW_HEIGHT;
  const rowBottom = rowTop + 28;
  return values
    .map((value, index) => {
      const x = CHART_START + (index / Math.max(1, values.length - 1)) * (CHART_END - CHART_START);
      const y = rowBottom - (value / 100) * 28;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

export function PulseGraph({
  activeSignals,
  progressPercent,
  revealFutureMood,
}: {
  activeSignals: ReadonlySet<PulseSignalKey>;
  progressPercent: number;
  revealFutureMood: boolean;
}) {
  const boundedProgress = Math.min(100, Math.max(0, progressPercent));
  const playheadX = CHART_START + (boundedProgress / 100) * (CHART_END - CHART_START);
  const lockedWidth = CHART_END - playheadX;

  return (
    <div className="overflow-x-auto border border-border bg-background/70">
      <div className="relative min-w-[42rem]">
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="Illustrative movie mood timeline with future events protected" className="block h-auto w-full">
          <defs>
            <pattern id="roomflix-pulse-lock" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="8" stroke="hsl(var(--border-hover))" strokeWidth="2" />
            </pattern>
          </defs>
          {[0, 25, 50, 75, 100].map((mark) => {
            const x = CHART_START + (mark / 100) * (CHART_END - CHART_START);
            return <line key={mark} x1={x} y1="10" x2={x} y2="207" stroke="hsl(var(--border-hover))" strokeDasharray="2 5" />;
          })}
          {PULSE_SIGNALS.map((signal, rowIndex) => {
            const active = activeSignals.has(signal.key);
            const rowTop = 22 + rowIndex * ROW_HEIGHT;
            const style = SIGNAL_STYLES[signal.key];
            const points = graphPoints(signal.values, rowIndex);
            return (
              <g key={signal.key} opacity={active ? 1 : 0.14}>
                <text x="14" y={rowTop + 18} fill={active ? style.stroke : "hsl(var(--muted-foreground))"} fontSize="10" fontWeight="700" letterSpacing="1.5">
                  {signal.label.toUpperCase()}
                </text>
                <line x1={CHART_START} y1={rowTop + 28} x2={CHART_END} y2={rowTop + 28} stroke="hsl(var(--border-hover))" />
                <polyline points={points} fill="none" stroke={style.glow} strokeWidth="8" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                <polyline points={points} fill="none" stroke={style.stroke} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
              </g>
            );
          })}
          {lockedWidth > 0 ? (
            <g>
              <rect x={playheadX} y="0" width={lockedWidth} height={HEIGHT} fill="hsl(var(--card))" opacity={revealFutureMood ? 0.65 : 0.94} />
              <rect x={playheadX} y="0" width={lockedWidth} height={HEIGHT} fill="url(#roomflix-pulse-lock)" opacity={revealFutureMood ? 0.2 : 0.45} />
              {lockedWidth > 145 ? (
                <text x={playheadX + 14} y="18" fill="hsl(var(--muted-foreground))" fontSize="9" fontWeight="700" letterSpacing="1.3">
                  {revealFutureMood ? "MOOD VISIBLE · PLOT LOCKED" : "SPOILER SHIELD"}
                </text>
              ) : null}
            </g>
          ) : null}
          <line x1={playheadX} y1="0" x2={playheadX} y2={HEIGHT} stroke="hsl(var(--accent))" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          <circle cx={playheadX} cy="12" r="5" fill="hsl(var(--accent))" />
        </svg>
        <div className="pointer-events-none absolute right-3 top-3 flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          <LockKeyhole className="h-3 w-3" /> Future protected
        </div>
      </div>
    </div>
  );
}
