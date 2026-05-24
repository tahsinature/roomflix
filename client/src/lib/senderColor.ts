// Deterministic per-sender color palette. Same `senderId` always
// resolves to the same tone — alice is always cyan, bob is always
// emerald, across all rooms and all sessions for every viewer. The
// accent (brand red) is reserved for "you" so the current viewer is
// always the visual outlier.
//
// Tones are picked to read clearly on the app's dark theme without
// fighting the accent. Each entry packages all the Tailwind classes
// the bubble layout needs so the hash lookup is the only branch in
// the row renderer.

export type SenderTone = {
  /** Bright color for the sender's name label. */
  text: string;
  /** Avatar circle background + text + border. */
  avatar: string;
};

const PALETTE: SenderTone[] = [
  { text: "text-cyan-300", avatar: "border-cyan-300/40 bg-cyan-300/10 text-cyan-300" },
  { text: "text-emerald-300", avatar: "border-emerald-300/40 bg-emerald-300/10 text-emerald-300" },
  { text: "text-amber-300", avatar: "border-amber-300/40 bg-amber-300/10 text-amber-300" },
  { text: "text-violet-300", avatar: "border-violet-300/40 bg-violet-300/10 text-violet-300" },
  { text: "text-pink-300", avatar: "border-pink-300/40 bg-pink-300/10 text-pink-300" },
  { text: "text-sky-300", avatar: "border-sky-300/40 bg-sky-300/10 text-sky-300" },
  { text: "text-rose-300", avatar: "border-rose-300/40 bg-rose-300/10 text-rose-300" },
  { text: "text-teal-300", avatar: "border-teal-300/40 bg-teal-300/10 text-teal-300" },
];

export function senderTone(senderId: string): SenderTone {
  // 32-bit FNV-ish hash — fast, deterministic, fine for small palettes.
  let h = 0;
  for (let i = 0; i < senderId.length; i++) {
    h = ((h << 5) - h + senderId.charCodeAt(i)) | 0;
  }
  return PALETTE[Math.abs(h) % PALETTE.length]!;
}
