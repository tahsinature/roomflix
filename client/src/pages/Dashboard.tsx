import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Database,
  HelpCircle,
  KeyRound,
  Library as LibraryIcon,
  Link2,
  ListMusic,
  Loader2,
  Play,
  Users2,
} from "lucide-react";
import type { LibraryHealth, Playlist, Video } from "@shared/protocol";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PlayButton } from "@/components/PlayButton";
import { useAuth } from "@/auth/AuthContext";
import { api } from "@/lib/api";
import { canonicalUrl, urlFilename } from "@/lib/utils";

const RECENT_LIMIT = 5;
const PLAYLIST_LIMIT = 5;

// Logged-in landing — body content only. AppNav lives in AuthedLayout.
// Three things you can actually do here: paste a URL and watch it, jump
// into a playlist, or admit a guest with their pairing code. Plus a peek
// at recent library / playlists.
export default function Dashboard() {
  const { user, currentSpace } = useAuth();
  const navigate = useNavigate();

  const [videos, setVideos] = useState<Video[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [health, setHealth] = useState<LibraryHealth | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!currentSpace) return;
    let cancelled = false;
    Promise.all([
      api.listVideos().catch(() => [] as Video[]),
      api.listPlaylists().catch(() => [] as Playlist[]),
      api.libraryHealth().catch(() => null),
    ]).then(([list, pls, h]) => {
      if (cancelled) return;
      setVideos(list);
      setPlaylists(pls);
      setHealth(h);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [currentSpace?.id]);

  const greetingName = user?.displayName?.trim() || (user ? `@${user.username}` : "");
  const isOwner = currentSpace?.role === "owner";

  if (!currentSpace) {
    return <NoSpaceState />;
  }

  return (
    <main className="relative">
      <BackgroundOrbs />
      <div className="mx-auto max-w-4xl px-4 pb-16 pt-6 sm:px-6 sm:pt-10">
        <header className="space-y-1">
          <span className="section-label muted">{currentSpace.name}</span>
          <h1 className="text-balance text-3xl font-medium tracking-tight text-foreground sm:text-4xl">
            Welcome back, <span className="text-accent">{greetingName}</span>.
          </h1>
          <p className="font-mono text-[12px] text-text-dim">
            {currentSpace.role === "owner" ? "You own this space." : "You're a member here."}
          </p>
        </header>

        <div className="mt-8">
          <QuickPlayCard
            spaceName={currentSpace.name}
            onSubmit={(url) => {
              navigate(`/watch?video=${encodeURIComponent(url)}`);
            }}
          />
        </div>

        {loaded && (
          <div className="mt-10 grid gap-6 md:grid-cols-2">
            <RecentLibrarySection videos={videos} health={health} />
            <PlaylistsCard playlists={playlists} />
          </div>
        )}

        {isOwner && <AdmitGuestInline />}

        <QuickLinks />
      </div>
    </main>
  );
}

// Paste-a-URL surface. Skips the empty-player friction — adding a URL via
// /watch?video= triggers a setUrl on the server, which idempotently saves
// to the library and broadcasts to the session. So one input is enough.
function QuickPlayCard({ spaceName, onSubmit }: { spaceName: string; onSubmit: (url: string) => void }) {
  const [url, setUrl] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;
    onSubmit(canonicalUrl(trimmed));
  };
  return (
    <section className="border border-border bg-bg-elevated/40 p-5 sm:p-6">
      <span className="section-label muted">Quick play</span>
      <form onSubmit={submit} className="mt-3 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-dim" />
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Paste a public video URL"
            className="pl-9"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
        </div>
        <Button type="submit" variant="accent" size="lg" disabled={!url.trim()} className="h-11">
          <Play className="h-4 w-4 fill-current" />
          Play
          <ArrowRight className="h-4 w-4" />
        </Button>
      </form>
      <p className="mt-2 text-[11px] text-text-dim">
        Plays for everyone in <span className="text-foreground">{spaceName}</span> and auto-saves to your library.
      </p>
    </section>
  );
}

// Inline-admit form for the TV-pairing flow. Mirrors the /spaces version
// but tucked onto the dashboard for fast access — the most common case
// is "girlfriend on phone right now, admit her" and the dashboard is
// where the owner already is.
function AdmitGuestInline() {
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok"; name: string } | { kind: "error"; text: string } | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const digits = code.replace(/\D/g, "");
    if (digits.length !== 8 || pending) return;
    setPending(true);
    setMessage(null);
    try {
      const result = await api.pairingApprove(digits);
      setMessage({ kind: "ok", name: result.displayName });
      setCode("");
    } catch (err) {
      setMessage({ kind: "error", text: (err as Error).message || "Couldn't admit" });
    } finally {
      setPending(false);
    }
  };

  // Display as "1234 5678" — splitting at 4 mirrors the placeholder
  // and matches how guests read codes out loud. Underlying state stays
  // digits-only so submit doesn't need to re-strip.
  const formatted = code.length > 4 ? `${code.slice(0, 4)} ${code.slice(4)}` : code;

  return (
    <section className="mt-10 border border-border bg-bg-elevated/40 p-5 sm:p-6">
      <div className="flex items-start gap-4">
        <KeyRound className="hidden h-5 w-5 shrink-0 text-accent sm:block" />
        <div className="min-w-0 flex-1">
          <span className="section-label muted">Admit a guest</span>
          <p className="mt-1 text-[12px] text-muted-foreground">
            They get an 8-digit pairing code on their device. Type it here and they're signed in to this space.
          </p>
          <form onSubmit={submit} className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Input
              value={formatted}
              onChange={(e) => {
                setCode(e.target.value.replace(/\D/g, "").slice(0, 8));
                setMessage(null);
              }}
              placeholder="•••• ••••"
              inputMode="numeric"
              autoComplete="off"
              className="font-mono tracking-[0.18em] sm:max-w-[14rem]"
            />
            <Button type="submit" variant="outline" disabled={pending || code.length !== 8} className="h-11">
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
              Admit
            </Button>
          </form>
          {message?.kind === "ok" && (
            <p className="mt-2 font-mono text-[11px] text-emerald-400">
              ✓ {message.name} is in.
            </p>
          )}
          {message?.kind === "error" && (
            <p className="mt-2 font-mono text-[11px] text-accent">{message.text}</p>
          )}
        </div>
      </div>
    </section>
  );
}

function RecentLibrarySection({ videos, health }: { videos: Video[]; health: LibraryHealth | null }) {
  if (videos.length === 0) {
    return (
      <section className="border border-border bg-bg-elevated/40 px-4 py-8 text-center">
        <LibraryIcon className="mx-auto h-5 w-5 text-text-dim" />
        <p className="mt-2 text-sm text-muted-foreground">Your space library is empty.</p>
        <Button asChild variant="ghost" size="sm" className="mt-3">
          <Link to="/library">
            Add your first video <ArrowRight className="h-3 w-3" />
          </Link>
        </Button>
      </section>
    );
  }

  const recent = videos.slice(0, RECENT_LIMIT);
  const hasMore = videos.length > RECENT_LIMIT;
  return (
    <section>
      <header className="mb-3 flex items-center justify-between">
        <span className="section-label muted">Recent library</span>
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
            <PlayButton video={v} health={health?.videos[v.id]} />
          </li>
        ))}
      </ul>
    </section>
  );
}

// Playlists peek alongside Recent library. Tap a row → /watch?playlist=
// which the watch page picks up and dispatches loadPlaylist on connect.
function PlaylistsCard({ playlists }: { playlists: Playlist[] }) {
  const navigate = useNavigate();
  if (playlists.length === 0) {
    return (
      <section className="border border-border bg-bg-elevated/40 px-4 py-8 text-center">
        <ListMusic className="mx-auto h-5 w-5 text-text-dim" />
        <p className="mt-2 text-sm text-muted-foreground">No playlists yet.</p>
        <Button asChild variant="ghost" size="sm" className="mt-3">
          <Link to="/library">
            Create one <ArrowRight className="h-3 w-3" />
          </Link>
        </Button>
      </section>
    );
  }

  const recent = playlists.slice(0, PLAYLIST_LIMIT);
  const hasMore = playlists.length > PLAYLIST_LIMIT;
  return (
    <section>
      <header className="mb-3 flex items-center justify-between">
        <span className="section-label muted">Playlists</span>
        <Link to="/library" className="flex items-center gap-1 text-xs text-muted-foreground transition hover:text-foreground">
          <ListMusic className="h-3 w-3" />
          {hasMore ? `See all ${playlists.length}` : "Manage"}
        </Link>
      </header>
      <ul className="border-y border-border">
        {recent.map((p) => (
          <li
            key={p.id}
            className="flex items-center gap-3 border-b border-border px-3 py-3 transition-colors last:border-b-0 hover:bg-white/[0.02]"
          >
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-foreground">{p.title}</div>
              <div className="font-mono text-[11px] text-text-dim">
                {p.videoIds.length} {p.videoIds.length === 1 ? "track" : "tracks"}
              </div>
            </div>
            <button
              type="button"
              aria-label={`Play ${p.title}`}
              onClick={() => navigate(`/watch?playlist=${encodeURIComponent(p.id)}`)}
              disabled={p.videoIds.length === 0}
              className="flex h-8 w-8 items-center justify-center text-foreground transition hover:text-accent disabled:opacity-30"
            >
              <Play className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function QuickLinks() {
  return (
    <nav className="mt-12 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[12px] text-text-dim">
      <Link to="/library" className="inline-flex items-center gap-1.5 transition hover:text-foreground">
        <LibraryIcon className="h-3 w-3" />
        Library
      </Link>
      <Link to="/storage" className="inline-flex items-center gap-1.5 transition hover:text-foreground">
        <Database className="h-3 w-3" />
        Storage
      </Link>
      <Link to="/spaces" className="inline-flex items-center gap-1.5 transition hover:text-foreground">
        <Users2 className="h-3 w-3" />
        Spaces
      </Link>
      <Link to="/help" className="inline-flex items-center gap-1.5 transition hover:text-foreground">
        <HelpCircle className="h-3 w-3" />
        Help
      </Link>
    </nav>
  );
}

function BackgroundOrbs() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="glow-orb glow-orb-coral absolute -right-32 -top-40 h-[36rem] w-[36rem]" />
      <div className="glow-orb glow-orb-indigo absolute -left-40 top-[30%] h-[32rem] w-[32rem]" />
    </div>
  );
}

function NoSpaceState() {
  return (
    <main className="relative">
      <BackgroundOrbs />
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-6 text-center">
        <Users2 className="h-7 w-7 text-text-dim" />
        <h1 className="mt-4 text-2xl font-medium text-foreground">You're not in a space.</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Roomflix groups your library, playlists, and storage into spaces. Create a new one or redeem an invite code to get started.
        </p>
        <Button asChild variant="accent" size="lg" className="mt-6">
          <Link to="/spaces">
            Manage spaces <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </main>
  );
}
