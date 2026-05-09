import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Clapperboard,
  Library as LibraryIcon,
  Sparkles,
} from "lucide-react";
import type { LibraryHealth, RoomListItem, Video } from "@shared/protocol";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
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
    <main className="relative mx-auto flex min-h-screen max-w-5xl flex-col items-center px-6 py-16">
      <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
        <Sparkles className="h-3 w-3 text-violet-400" />
        Synced playback for any public video URL
      </div>

      <h1 className="mt-6 text-center text-5xl font-bold tracking-tight sm:text-6xl">
        <span className="text-gradient">Roomflix.</span>
        <br />
        <span className="text-foreground/90">In perfect sync.</span>
      </h1>

      <p className="mt-5 max-w-xl text-center text-base text-muted-foreground">
        Create a room, share the link, paste any public video URL — play,
        pause, seek, and mute land on everyone's screen at the same time.
      </p>

      <Card className="mt-12 w-full max-w-xl animate-fade-in">
        <CardContent className="space-y-6 p-6 pt-6">
          <Button
            variant="accent"
            size="lg"
            className="w-full text-base"
            onClick={createRoom}
          >
            <Clapperboard className="h-5 w-5" />
            Create a room
            <ArrowRight className="h-4 w-4" />
          </Button>

          <div className="relative py-1 text-center text-xs uppercase tracking-widest text-muted-foreground">
            <span className="bg-card px-3">or join an existing room</span>
            <div className="absolute inset-x-0 top-1/2 -z-10 h-px bg-border" />
          </div>

          <form onSubmit={joinRoom} className="flex gap-2">
            <Input
              value={joinId}
              onChange={(e) => setJoinId(e.target.value)}
              placeholder="room-id"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
            />
            <Button type="submit" variant="outline" disabled={!joinId.trim()}>
              Join
            </Button>
          </form>
        </CardContent>
      </Card>

      <RecentLibrary />
    </main>
  );
}

function RecentLibrary() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [rooms, setRooms] = useState<RoomListItem[]>([]);
  const [health, setHealth] = useState<LibraryHealth | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.listVideos().catch(() => [] as Video[]),
      api.listRooms().catch(() => [] as RoomListItem[]),
      api.libraryHealth().catch(() => null),
    ]).then(([list, rs, h]) => {
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
      <Button
        asChild
        variant="ghost"
        size="sm"
        className="mt-6 text-muted-foreground"
      >
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
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Recent
        </h2>
        <Link
          to="/library"
          className="flex items-center gap-1 text-xs text-muted-foreground transition hover:text-foreground"
        >
          <LibraryIcon className="h-3 w-3" />
          {hasMore ? `See all ${videos.length}` : "Open library"}
        </Link>
      </header>

      <ul className="flex flex-col gap-2">
        {recent.map((v) => (
          <li
            key={v.id}
            className="glass flex items-center gap-3 rounded-xl px-4 py-3"
          >
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-foreground">
                {v.title}
              </div>
              <div
                className="truncate font-mono text-[11px] text-muted-foreground"
                title={v.url}
              >
                {urlFilename(v.url)}
              </div>
            </div>
            <PlayButton
              video={v}
              rooms={rooms}
              health={health?.videos[v.id]}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
