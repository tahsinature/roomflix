// Tiny Web Audio chime. No asset, no network — a single AudioContext
// reused across notifications. Two pitches keep messages and reactions
// audibly distinct without anything getting noisy. Errors swallowed:
// the chime is purely a nicety, never block on it.

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (ctx) return ctx;
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    return ctx;
  } catch {
    return null;
  }
}

export type ChimeKind = "message" | "reaction";

// Sine ping with a 120 ms exponential decay envelope. Peak gain is
// deliberately low (~0.07) so it reads as a notification, not an alarm.
export function playChime(kind: ChimeKind): void {
  const c = getCtx();
  if (!c) return;
  try {
    if (c.state === "suspended") {
      // Autoplay policy may suspend the context until the user
      // interacts. Resume opportunistically; if it stays suspended we
      // silently skip the chime.
      c.resume().catch(() => undefined);
    }
    const now = c.currentTime;
    const duration = kind === "reaction" ? 0.1 : 0.14;
    const peak = 0.07;

    const osc = c.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(kind === "reaction" ? 880 : 560, now);

    const gain = c.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(peak, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain).connect(c.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  } catch {
    /* not critical */
  }
}
