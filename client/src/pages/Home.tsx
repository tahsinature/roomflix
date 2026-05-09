import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Clapperboard, Heart, Library as LibraryIcon } from "lucide-react";
import type { LibraryHealth, RoomListItem, Video } from "@shared/protocol";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PlayButton } from "@/components/PlayButton";
import { api } from "@/lib/api";
import { randomRoomId, urlFilename } from "@/lib/utils";

const RECENT_LIMIT = 3;

export default function Home() {
  const navigate = useNavigate();
  const [joinId, setJoinId] = useState("");

  const createRoom = () => {
    navigate(`/room/${randomRoomId()}`);
  };

  const joinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    const id = joinId.trim().toLowerCase();
    if (id) navigate(`/room/${encodeURIComponent(id)}`);
  };

  return (
    <main className="relative mx-auto flex min-h-screen max-w-5xl flex-col items-center justify-center px-6 py-16">
      <BackgroundOrbs />

      <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
        <Heart className="h-3 w-3 fill-rose-400/70 text-rose-300" />
        For couples, friends, and movie clubs
      </div>

      <h1 className="mt-6 text-center text-5xl font-bold tracking-tight sm:text-6xl">
        <span className="text-gradient">Roomflix.</span>
        <br />
        <span className="text-foreground/90">Movie nights, miles apart.</span>
      </h1>

      <p className="mt-5 max-w-xl text-center text-base leading-relaxed text-muted-foreground">
        Press play together — from anywhere. Share a link, pick a video, and watch in perfect sync.
      </p>

      <div className="mt-12 flex w-full max-w-md flex-col items-stretch gap-4 animate-fade-in">
        <Button variant="accent" size="lg" className="w-full text-base shadow-2xl shadow-violet-500/25" onClick={createRoom}>
          <Clapperboard className="h-5 w-5" />
          Start a movie night
          <ArrowRight className="h-4 w-4" />
        </Button>

        {/* Quiet secondary join — pill-shaped so it reads as a single
            atomic input, not a competing form. The "Have a room?" prefix
            anchors the intent without needing a divider line. */}
        <form
          onSubmit={joinRoom}
          className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] py-1 pl-4 pr-1 transition-colors focus-within:border-white/20 focus-within:bg-white/[0.05]"
        >
          <span className="shrink-0 text-xs text-muted-foreground">Have a room?</span>
          <Input
            value={joinId}
            onChange={(e) => setJoinId(e.target.value)}
            placeholder="room-id"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            className="h-8 flex-1 border-0 bg-transparent px-1 text-sm shadow-none focus-visible:ring-0"
          />
          <Button type="submit" variant="ghost" size="sm" disabled={!joinId.trim()} className="h-7 shrink-0 rounded-full px-3 text-xs">
            Join
            <ArrowRight className="h-3 w-3" />
          </Button>
        </form>
      </div>

      <RecentLibrary />

      <footer className="flex flex-col items-center gap-1 pt-12 text-center text-xs text-muted-foreground/70">
        <span>Made for the people you watch with. No accounts, no tracking.</span>
        <Link to="/help" className="transition hover:text-foreground">
          How to host your video →
        </Link>
      </footer>
    </main>
  );
}

// Two slow-drifting blurred gradient orbs behind the hero. They sit fixed
// to the viewport so the warmth carries past the fold; pointer-events-none
// keeps them out of the way; -z-10 places them under all foreground content.
function BackgroundOrbs() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="orb-a absolute -left-32 top-[-10%] h-[36rem] w-[36rem] rounded-full bg-violet-600/20 blur-3xl" />
      <div className="orb-b absolute -right-32 top-[40%] h-[32rem] w-[32rem] rounded-full bg-rose-500/15 blur-3xl" />
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
      <Button asChild variant="ghost" size="sm" className="mt-6 text-muted-foreground">
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
    <section className="mt-10 w-full max-w-xl">
      <header className="mb-3 flex items-center justify-between px-1">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Recent</h2>
        <Link to="/library" className="flex items-center gap-1 text-xs text-muted-foreground transition hover:text-foreground">
          <LibraryIcon className="h-3 w-3" />
          {hasMore ? `See all ${videos.length}` : "Open library"}
        </Link>
      </header>

      <ul className="flex flex-col gap-2">
        {recent.map((v) => (
          <li
            key={v.id}
            className="glass flex items-center gap-3 rounded-xl px-4 py-3 transition-all duration-200 hover:-translate-y-0.5 hover:bg-white/[0.06] hover:shadow-lg hover:shadow-violet-500/5"
          >
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-foreground">{v.title}</div>
              <div className="truncate font-mono text-[11px] text-muted-foreground" title={v.url}>
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
