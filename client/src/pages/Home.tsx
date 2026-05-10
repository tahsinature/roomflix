import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Clapperboard, Library as LibraryIcon } from "lucide-react";
import type { LibraryHealth, RoomListItem, Video } from "@shared/protocol";
import { Button } from "@/components/ui/button";
import { PlayButton } from "@/components/PlayButton";
import { api } from "@/lib/api";
import { randomRoomId, urlFilename } from "@/lib/utils";

const RECENT_LIMIT = 4;

// Sample IDs cycled by the JOIN field's typing effect. Mix of friendly
// branded names (matches the SyncPreview's `room://aurora-cat` example) and
// 6-char IDs (what the system actually generates).
const SAMPLE_ROOM_IDS = ["aurora-cat", "k3p7q2", "velvet-fox", "n2hc6r", "neon-owl"];

export default function Home() {
  const navigate = useNavigate();
  const [joinId, setJoinId] = useState("");
  const [joinFocused, setJoinFocused] = useState(false);

  const createRoom = () => {
    navigate(`/room/${randomRoomId()}`);
  };

  const joinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    const id = joinId.trim().toLowerCase();
    if (id) navigate(`/room/${encodeURIComponent(id)}`);
  };

  // Pause the typing animation once the user engages with the field — once
  // they're typing, we don't want a phantom placeholder competing with their
  // actual text or the OS caret.
  const showTyping = joinId.length === 0 && !joinFocused;
  const typed = useTypingPlaceholder(SAMPLE_ROOM_IDS, showTyping);

  return (
    <main className="relative">
      <BackgroundOrbs />
      <SiteNav onStart={createRoom} />

      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <section className="relative flex min-h-[100vh] flex-col items-center justify-center px-6 pb-24 pt-32 text-center sm:pt-40">
        <div className="fade-up inline-flex items-center gap-2 border border-border bg-bg-elevated/40 px-3 py-1.5 text-[12px] text-muted-foreground backdrop-blur">
          <span className="inline-flex h-2 w-2 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_8px_rgb(52_211_153/0.7)]" />
          <span className="font-medium tracking-wide">live sync · no signup needed</span>
        </div>

        <h1 className="mt-7 max-w-3xl text-balance text-[44px] font-bold leading-[1.05] tracking-tightest sm:text-[60px] lg:text-[72px]">
          Movie nights, <em className="accent-em">miles apart.</em>
        </h1>

        <p className="fade-up-d1 mt-7 max-w-xl text-base leading-[1.7] text-muted-foreground sm:text-[17px]">
          Share a room link, drop a video URL, and watch in perfect sync. <span className="text-foreground/85">No accounts, no apps, no buffering wars.</span>
        </p>

        <div className="fade-up-d3 mt-10 flex w-full max-w-md flex-col items-stretch gap-3">
          <Button variant="accent" size="lg" className="w-full text-base" onClick={createRoom}>
            <Clapperboard className="h-5 w-5" />
            Start a movie night
            <ArrowRight className="h-4 w-4" />
          </Button>

          {/* Quiet secondary join. Terminal-style: JOIN label, divider, ›
              prompt, then a typable area. When empty + unfocused, a fake
              placeholder types itself out cycling through example IDs with
              a blinking caret — vanishes the moment the user clicks in. */}
          <form
            onSubmit={joinRoom}
            className="group flex h-11 items-stretch border border-border bg-bg-elevated/40 transition-colors focus-within:border-accent/50 focus-within:bg-bg-elevated/70"
          >
            <label
              htmlFor="home-join-input"
              className="flex shrink-0 cursor-text items-center px-4 text-[11px] uppercase tracking-[0.18em] text-text-dim transition-colors group-focus-within:text-muted-foreground"
            >
              Join
            </label>
            <span className="my-2 w-px bg-border" aria-hidden />
            <div className="relative flex flex-1 items-center pl-3 pr-1">
              <span className="pointer-events-none mr-1 text-text-dim transition-colors group-focus-within:text-accent" aria-hidden>
                ›
              </span>
              <div className="relative flex-1">
                <input
                  id="home-join-input"
                  value={joinId}
                  onChange={(e) => setJoinId(e.target.value)}
                  onFocus={() => setJoinFocused(true)}
                  onBlur={() => setJoinFocused(false)}
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  className="w-full bg-transparent font-mono text-sm text-foreground caret-accent focus:outline-none"
                />
                {showTyping && (
                  <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center font-mono text-sm text-text-dim" aria-hidden>
                    {typed}
                    <span className="ml-px inline-block h-[1.05em] w-[2px] bg-foreground/70 animate-caret-blink" />
                  </span>
                )}
              </div>
              <button
                type="submit"
                disabled={!joinId.trim()}
                aria-label="Join room"
                className="ml-1 flex h-7 w-7 shrink-0 items-center justify-center text-text-dim transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
              >
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </form>
        </div>

        <SyncPreview />

        <RecentLibrary />
      </section>

      <SiteFooter />
    </main>
  );
}

// Two large blurred glow orbs that sit fixed behind the page. The coral one
// pulls warmth from the hero; the indigo + cyan ones add cool counter-tones
// further down. Pointer-events:none keeps them out of the way of clicks.
function BackgroundOrbs() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="glow-orb glow-orb-coral absolute -right-32 -top-40 h-[36rem] w-[36rem]" />
      <div className="glow-orb glow-orb-indigo absolute -left-40 top-[30%] h-[32rem] w-[32rem]" />
      <div className="glow-orb glow-orb-cyan absolute bottom-[-10%] left-[40%] h-[24rem] w-[24rem]" />
    </div>
  );
}

// Top navigation: brand on the left, a pair of utility links + a CTA on the
// right. Sticky + backdrop-blurred so the warmth carries underneath.
function SiteNav({ onStart }: { onStart: () => void }) {
  return (
    <nav className="fade-up fixed inset-x-0 top-0 z-40 flex items-center justify-between border-b border-border bg-background/70 px-5 py-3.5 backdrop-blur-xl backdrop-saturate-150 sm:px-8">
      <Link to="/" className="flex items-center gap-2.5 text-foreground transition hover:opacity-80">
        <BrandMark />
        <span className="text-[15px] font-bold tracking-tight">
          Roomflix<span className="text-accent">.</span>
        </span>
      </Link>
      <div className="flex items-center gap-2 sm:gap-5">
        <Link to="/library" className="hidden text-[13px] text-muted-foreground transition hover:text-foreground sm:inline">
          Library
        </Link>
        <Link to="/help" className="hidden text-[13px] text-muted-foreground transition hover:text-foreground sm:inline">
          Help
        </Link>
        <Button variant="accent" size="sm" onClick={onStart}>
          Start
          <ArrowRight className="h-3 w-3" />
        </Button>
      </div>
    </nav>
  );
}

// Tiny inline logo — square frame with a coral play triangle. Mono and
// minimal so it pairs with the wordmark.
function BrandMark() {
  return (
    <span className="relative inline-flex h-7 w-7 items-center justify-center border border-accent/40 bg-accent/10 shadow-[0_0_18px_hsl(0_100%_65%/0.25)]">
      <span className="block h-0 w-0 border-y-[5px] border-l-[7px] border-y-transparent border-l-accent" style={{ marginLeft: "1.5px" }} aria-hidden />
    </span>
  );
}

// "Sync preview" — a small terminal-style panel in the hero showing what a
// live room looks like. Uses staggered fade-ups so the lines feel like they're
// being printed in. Anchors the abstract "press play together" promise in
// something concrete the visitor can read.
function SyncPreview() {
  return (
    <div className="fade-up-d4 mt-16 w-full max-w-[640px]">
      <div className="border border-border bg-bg-elevated">
        <div className="flex items-center gap-2 border-b border-border bg-white/[0.02] px-4 py-2.5">
          <span className="term-dot bg-[#ff5f57]" />
          <span className="term-dot bg-[#ffbd2e]" />
          <span className="term-dot bg-[#28c840]" />
          <span className="flex-1 text-center text-[11px] text-text-dim">room://aurora-cat</span>
          <span className="text-[10px] text-text-dim opacity-0 sm:opacity-100">●REC</span>
        </div>
        <div className="space-y-1.5 p-5 text-left font-mono text-[13px] leading-[1.9]">
          <div className="fade-up-d1 flex items-center gap-3 text-foreground">
            <span className="text-accent">▶</span>
            <span>playing</span>
            <span className="ml-auto tabular-nums text-text-dim">00:42:18 / 01:48:00</span>
          </div>
          <div className="fade-up-d2 flex items-center gap-3 text-foreground">
            <span className="text-live">✓</span>
            <span>in sync</span>
            <span className="ml-auto tabular-nums text-text-dim">±0.04s drift</span>
          </div>
          <div className="fade-up-d3 flex items-center gap-3 text-foreground">
            <span className="text-cyan">⊙</span>
            <span>2 viewers connected</span>
            <span className="ml-auto text-text-dim">@you · @sam</span>
          </div>
          <div className="fade-up-d4 flex items-center gap-3 text-muted-foreground">
            <span className="text-text-dim">↗</span>
            <span>link copied · share to invite</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function RecentLibrary() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [rooms, setRooms] = useState<RoomListItem[]>([]);
  const [health, setHealth] = useState<LibraryHealth | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.listVideos().catch(() => [] as Video[]), api.listRooms().catch(() => [] as RoomListItem[]), api.libraryHealth().catch(() => null)]).then(([list, rs, h]) => {
      if (cancelled) return;
      setVideos(list);
      setRooms(rs);
      setHealth(h);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Render nothing until we know — avoids a flash of "empty" before data arrives.
  if (!loaded) return null;

  if (videos.length === 0) {
    return (
      <Button asChild variant="ghost" size="sm" className="mt-10 text-muted-foreground">
        <Link to="/library">
          <LibraryIcon className="h-3.5 w-3.5" />
          Open library
        </Link>
      </Button>
    );
  }

  const recent = videos.slice(0, RECENT_LIMIT);
  const hasMore = videos.length > RECENT_LIMIT;

  return (
    <section className="mt-20 w-full max-w-[640px] text-left">
      <header className="mb-4 flex items-center justify-between">
        <span className="section-label muted">Recent</span>
        <Link to="/library" className="flex items-center gap-1 text-xs text-muted-foreground transition hover:text-foreground">
          <LibraryIcon className="h-3 w-3" />
          {hasMore ? `See all ${videos.length}` : "Open library"}
        </Link>
      </header>

      <ul className="border-y border-border">
        {recent.map((v) => (
          <li
            key={v.id}
            className="flex items-center gap-3 border-b border-border px-3 py-3 transition-colors last:border-b-0 hover:bg-white/[0.02]"
          >
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-foreground">{v.title}</div>
              <div className="truncate font-mono text-[11px] text-text-dim" title={v.url}>
                {urlFilename(v.url)}
              </div>
            </div>
            <PlayButton video={v} rooms={rooms} health={health?.videos[v.id]} />
          </li>
        ))}
      </ul>
    </section>
  );
}

// Cycles through `words` typing each one out, pausing, erasing, and moving
// on. Returns the current visible substring. `enabled` pauses the loop
// without clearing the text — flip it to false when the user focuses the
// real input so the phantom placeholder doesn't fight the OS caret.
function useTypingPlaceholder(words: string[], enabled: boolean): string {
  const [text, setText] = useState("");
  const [idx, setIdx] = useState(0);
  const [deleting, setDeleting] = useState(false);
  // Hold the latest enabled flag so the running timeout can bail out without
  // restarting the entire effect on every flip.
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  useEffect(() => {
    if (!enabled) return;
    const word = words[idx % words.length] ?? "";
    const isComplete = !deleting && text === word;
    const isEmpty = deleting && text.length === 0;
    const delay = isComplete ? 1700 : isEmpty ? 350 : deleting ? 45 : 95;

    const t = setTimeout(() => {
      if (!enabledRef.current) return;
      if (isComplete) {
        setDeleting(true);
      } else if (isEmpty) {
        setDeleting(false);
        setIdx((i) => i + 1);
      } else {
        setText((cur) => (deleting ? cur.slice(0, -1) : word.slice(0, cur.length + 1)));
      }
    }, delay);
    return () => clearTimeout(t);
  }, [text, idx, deleting, enabled, words]);

  return text;
}

function SiteFooter() {
  return (
    <footer className="border-t border-border px-6 py-10 text-center text-[12px] text-text-dim">
      <p className="mx-auto max-w-md leading-relaxed">
        Made for the people you watch with. <span className="text-muted-foreground">No accounts. No tracking. Direct video URLs only.</span>
      </p>
      <div className="mt-4 flex justify-center gap-6 text-[12px]">
        <Link to="/library" className="text-muted-foreground transition hover:text-foreground">
          Library
        </Link>
        <Link to="/help" className="text-muted-foreground transition hover:text-foreground">
          How to host
        </Link>
      </div>
    </footer>
  );
}
