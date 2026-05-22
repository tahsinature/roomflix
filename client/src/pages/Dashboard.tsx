import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Layers, Library as LibraryIcon, Link2, Play, Users2 } from "lucide-react";
import type { Collection, LibraryHealth, Video } from "@shared/protocol";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PlayButton } from "@/components/PlayButton";
import { useAuth } from "@/auth/AuthContext";
import { api } from "@/lib/api";
import { canonicalUrl, urlFilename } from "@/lib/utils";

const RECENT_LIMIT = 4;
const COLLECTION_LIMIT = 4;

// Logged-in landing — tight, scrollless on a typical desktop. Two
// things you can do here: paste a URL to play, or jump straight to a
// recent video / playlist. Everything else (library mgmt, storage,
// admit guests, etc.) is reachable from the AppNav / ViewerPill /
// AccountMenu, so we don't restate it here.
export default function Dashboard() {
  const { user, currentSpace } = useAuth();
  const navigate = useNavigate();

  const [videos, setVideos] = useState<Video[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [health, setHealth] = useState<LibraryHealth | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!currentSpace) return;
    let cancelled = false;
    Promise.all([api.listVideos().catch(() => [] as Video[]), api.listCollections().catch(() => [] as Collection[]), api.libraryHealth().catch(() => null)]).then(
      ([list, cols, h]) => {
        if (cancelled) return;
        setVideos(list);
        setCollections(cols);
        setHealth(h);
        setLoaded(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [currentSpace?.id]);

  const greetingName = user?.displayName?.trim() || (user ? `@${user.username}` : "");

  if (!currentSpace) {
    return <NoSpaceState />;
  }

  return (
    <main className="relative">
      <BackgroundOrbs />
      <div className="mx-auto flex max-w-4xl flex-col gap-6 px-4 pt-6 sm:px-6 sm:pt-8">
        {/* Compact welcome — one line. Space name is in the AppNav
            switcher; we don't restate "you own this space" here since
            the AccountMenu already shows the role. */}
        <header>
          <h1 className="text-balance text-2xl font-medium tracking-tight text-foreground sm:text-3xl">
            Welcome back, <span className="text-accent">{greetingName}</span>.
          </h1>
        </header>

        <QuickPlayCard
          onSubmit={(url) => {
            navigate(`/watch?video=${encodeURIComponent(url)}`);
          }}
        />

        {loaded && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <RecentLibrarySection videos={videos} health={health} />
            <CollectionsCard collections={collections} />
          </div>
        )}
      </div>
    </main>
  );
}

// Paste-a-URL surface. Skips the empty-player friction — adding a URL
// via /watch?video= triggers a setUrl on the server, which idempotently
// saves to the library and broadcasts to the session. So one input is
// enough.
function QuickPlayCard({ onSubmit }: { onSubmit: (url: string) => void }) {
  const [url, setUrl] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;
    onSubmit(canonicalUrl(trimmed));
  };
  return (
    <section className="border border-border bg-bg-elevated/40 p-4 sm:p-5">
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
    </section>
  );
}

function RecentLibrarySection({ videos, health }: { videos: Video[]; health: LibraryHealth | null }) {
  if (videos.length === 0) {
    return (
      <section className="border border-border bg-bg-elevated/40 px-4 py-6 text-center">
        <LibraryIcon className="mx-auto h-5 w-5 text-text-dim" />
        <p className="mt-2 text-sm text-muted-foreground">Library is empty.</p>
        <Button asChild variant="ghost" size="sm" className="mt-2">
          <Link to="/library">
            Add a video <ArrowRight className="h-3 w-3" />
          </Link>
        </Button>
      </section>
    );
  }

  const recent = videos.slice(0, RECENT_LIMIT);
  return (
    <section>
      <header className="mb-2">
        <span className="section-label muted">Recent</span>
      </header>
      <ul className="border-y border-border">
        {recent.map((v) => (
          <li key={v.id} className="flex items-center gap-3 border-b border-border px-3 py-2.5 transition-colors last:border-b-0 hover:bg-white/[0.02]">
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

function CollectionsCard({ collections }: { collections: Collection[] }) {
  const navigate = useNavigate();
  if (collections.length === 0) {
    return (
      <section className="border border-border bg-bg-elevated/40 px-4 py-6 text-center">
        <Layers className="mx-auto h-5 w-5 text-text-dim" />
        <p className="mt-2 text-sm text-muted-foreground">No collections yet.</p>
        <Button asChild variant="ghost" size="sm" className="mt-2">
          <Link to="/library">
            Create one <ArrowRight className="h-3 w-3" />
          </Link>
        </Button>
      </section>
    );
  }

  const recent = collections.slice(0, COLLECTION_LIMIT);
  return (
    <section>
      <header className="mb-2">
        <span className="section-label muted">Collections</span>
      </header>
      <ul className="border-y border-border">
        {recent.map((c) => (
          <li key={c.id} className="flex items-center gap-3 border-b border-border px-3 py-2.5 transition-colors last:border-b-0 hover:bg-white/[0.02]">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-foreground">{c.title}</div>
              <div className="font-mono text-[11px] text-text-dim">
                {c.items.length} {c.items.length === 1 ? "item" : "items"}
              </div>
            </div>
            <button
              type="button"
              aria-label={`Play ${c.title}`}
              onClick={() => navigate(`/watch?collection=${encodeURIComponent(c.id)}`)}
              disabled={c.items.length === 0}
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
          <Link to="/settings/space">
            Manage spaces <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </main>
  );
}
