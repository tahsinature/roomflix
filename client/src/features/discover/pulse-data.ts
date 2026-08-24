export type PulseSignalKey = "tension" | "fear" | "intimacy" | "pace";

export type PulseSignal = {
  key: PulseSignalKey;
  label: string;
  description: string;
  values: number[];
};

export const PULSE_SIGNALS: PulseSignal[] = [
  {
    key: "tension",
    label: "Tension",
    description: "Suspense and uncertainty",
    values: [18, 22, 34, 48, 42, 64, 76, 68, 84, 92, 78, 88, 96, 82, 58],
  },
  {
    key: "fear",
    label: "Fear",
    description: "Scares and disturbing moments",
    values: [3, 5, 12, 28, 8, 18, 44, 20, 56, 34, 72, 42, 86, 48, 22],
  },
  {
    key: "intimacy",
    label: "Intimacy",
    description: "Romantic or sexual content",
    values: [6, 12, 24, 46, 68, 52, 28, 12, 8, 18, 10, 5, 12, 26, 10],
  },
  {
    key: "pace",
    label: "Pace",
    description: "How quickly the story moves",
    values: [24, 20, 28, 38, 54, 68, 50, 62, 74, 60, 82, 90, 78, 94, 64],
  },
];

export type PulseRecap = {
  phase: string;
  phaseDetail: string;
  situation: string;
  people: string;
  remember: string;
  threads: string[];
};

const RECAPS: PulseRecap[] = [
  {
    phase: "The setup is taking shape",
    phaseDetail: "You are still learning the rules of this story.",
    situation: "The central problem has appeared, but the movie is intentionally withholding its full meaning.",
    people: "The lead, a close connection, and the person challenging their immediate goal matter most right now.",
    remember: "Hold onto the opening warning and the unusual detail the lead noticed. You have enough context for now.",
    threads: ["Why the warning matters", "Who can be trusted", "What the lead is not saying"],
  },
  {
    phase: "The pieces are connecting",
    phaseDetail: "Earlier choices are beginning to have consequences.",
    situation: "The immediate objective is clearer, and the characters understand part of what stands in their way.",
    people: "Two relationships have shifted. Watch who shares information and who avoids a direct answer.",
    remember: "A repeated phrase and a seemingly minor object now connect two earlier scenes.",
    threads: ["The cost of the current plan", "A conflicting story", "Why the same detail keeps returning"],
  },
  {
    phase: "The story is converging",
    phaseDetail: "Most setup is complete; unresolved choices now drive the movie.",
    situation: "The main conflict is exposed. What remains unclear is how far each character will go to resolve it.",
    people: "The lead's closest ally and strongest opponent now want mutually exclusive outcomes.",
    remember: "The movie has given you the necessary facts. Remaining uncertainty is part of the intended tension.",
    threads: ["Which promise will be broken", "Whether the apparent solution can work", "What the lead will sacrifice"],
  },
];

export function recapAt(progressMinutes: number, runtimeMinutes: number): PulseRecap {
  const ratio = progressMinutes / runtimeMinutes;
  if (ratio < 0.34) return RECAPS[0];
  if (ratio < 0.68) return RECAPS[1];
  return RECAPS[2];
}

export function formatPulseTime(minutes: number): string {
  const seconds = Math.max(0, Math.round(minutes * 60));
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return hours ? `${hours}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}` : `${mins}:${String(secs).padStart(2, "0")}`;
}
