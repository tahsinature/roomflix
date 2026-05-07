import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Clapperboard,
  Library as LibraryIcon,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import type { RoomListItem } from "@shared/protocol";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { api } from "@/lib/api";
import { cn, randomRoomId } from "@/lib/utils";

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

      <Button
        asChild
        variant="ghost"
        size="sm"
        className="mt-4 text-muted-foreground"
      >
        <Link to="/library">
          <LibraryIcon className="h-3.5 w-3.5" />
          Browse library
        </Link>
      </Button>

      <LiveRooms />
    </main>
  );
}

function LiveRooms() {
  const [rooms, setRooms] = useState<RoomListItem[]>([]);
  const [mode, setMode] = useState<"live" | "all">("live");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setRefreshing(true);
    setError("");
    api
      .listRooms({ includeAll: mode === "all" })
      .then((list) => {
        if (!cancelled) setRooms(list);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
          setRefreshing(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [mode]);

  const refresh = async () => {
    setRefreshing(true);
    setError("");
    try {
      const list = await api.listRooms({ includeAll: mode === "all" });
      setRooms(list);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <section className="mt-14 w-full max-w-2xl">
      <header className="mb-3 flex items-center justify-between px-1">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Rooms
        </h2>
        <div className="flex items-center gap-3">
          <ModeToggle value={mode} onChange={setMode} />
          <button
            type="button"
            onClick={refresh}
            disabled={loading || refreshing}
            aria-label="Refresh"
            className="text-muted-foreground transition hover:text-foreground disabled:opacity-50"
          >
            <RefreshCw
              className={cn("h-3.5 w-3.5", refreshing && "animate-spin")}
            />
          </button>
        </div>
      </header>

      {error && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border border-white/5 bg-white/[0.02] px-4 py-6 text-center text-xs text-muted-foreground">
          Loading…
        </div>
      ) : rooms.length === 0 ? (
        <div className="rounded-xl border border-white/5 bg-white/[0.02] px-4 py-6 text-center text-xs text-muted-foreground">
          {mode === "live"
            ? "No live rooms. Create one above to start."
            : "No rooms exist right now."}
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {rooms.map((r) => (
            <RoomRow key={r.id} room={r} />
          ))}
        </ul>
      )}
    </section>
  );
}

function ModeToggle({
  value,
  onChange,
}: {
  value: "live" | "all";
  onChange: (v: "live" | "all") => void;
}) {
  return (
    <div className="inline-flex rounded-full border border-white/10 bg-white/[0.04] p-0.5">
      <ModeButton active={value === "live"} onClick={() => onChange("live")}>
        Live
      </ModeButton>
      <ModeButton active={value === "all"} onClick={() => onChange("all")}>
        All
      </ModeButton>
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-2.5 py-0.5 text-[11px] font-medium transition",
        active
          ? "bg-white/10 text-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function RoomRow({ room }: { room: RoomListItem }) {
  const isLive = room.viewers > 0;
  return (
    <li>
      <Link
        to={`/room/${encodeURIComponent(room.id)}`}
        className={cn(
          "glass flex items-center justify-between gap-3 rounded-xl px-4 py-3 transition hover:bg-white/[0.06]",
          !isLive && "opacity-60 hover:opacity-100",
        )}
      >
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={cn(
              "font-mono text-sm font-medium",
              isLive ? "text-foreground" : "text-foreground/70",
            )}
          >
            #{room.id}
          </span>
          <span className="hidden truncate text-xs text-muted-foreground sm:inline">
            {room.video ? room.video.title : "No video loaded"}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
          {isLive ? (
            <>
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgb(52_211_153/0.6)]" />
              {room.viewers} {room.viewers === 1 ? "viewer" : "viewers"}
            </>
          ) : (
            <>
              <span className="h-1.5 w-1.5 rounded-full bg-white/25" />
              empty
            </>
          )}
        </div>
      </Link>
    </li>
  );
}
