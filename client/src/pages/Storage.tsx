import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Crown, Database, Loader2, Settings } from "lucide-react";
import type { StorageConnection } from "@shared/protocol";
import { useAuth } from "@/auth/AuthContext";
import { api } from "@/lib/api";
import { loadFullConnection } from "@/lib/buckets/session";
import { StorageWorkspace } from "@/pages/StorageWorkspace";
import type { Connection } from "@/lib/buckets/types";
import { cn } from "@/lib/utils";

// Space-scoped storage view. Horizontal pill strip lists every
// connection accessible in the current space; the main pane shows the
// file browser for whichever connection is picked. Same shape as
// /settings/space (pill switcher above the detail) so the two surfaces
// feel consistent.
//
// CRUD lives at /settings/storage. This page is "what can I use right
// now in <space>" — same shape for owner, members, and guests.
export default function Storage() {
  const { user, currentSpace } = useAuth();
  const [connections, setConnections] = useState<StorageConnection[] | null>(null);
  const [error, setError] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    if (!currentSpace) return;
    let cancelled = false;
    setConnections(null);
    setError("");
    setActiveId(null);
    api
      .listSpaceStorage(currentSpace.id)
      .then((list) => {
        if (cancelled) return;
        setConnections(list);
        // Auto-select the first connection so the file browser never
        // boots into an empty "pick one" state when there's an obvious
        // single choice.
        if (list.length > 0) setActiveId(list[0]!.id);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message || "Failed to load storage");
      });
    return () => {
      cancelled = true;
    };
  }, [currentSpace?.id]);

  const active = useMemo(() => connections?.find((c) => c.id === activeId) ?? null, [connections, activeId]);

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-5">
        <div className="flex flex-col leading-tight">
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {currentSpace?.name ?? "Buckets"}
          </span>
          <h1 className="flex items-center gap-2 text-base font-semibold tracking-tight text-foreground">
            <Database className="h-4 w-4 text-accent" />
            Storage
            {connections && (
              <span className="font-mono text-[12px] font-normal text-text-dim">· {connections.length}</span>
            )}
          </h1>
        </div>
        {user && (
          <Link
            to="/settings/storage"
            className="inline-flex items-center gap-1.5 border border-border bg-bg-elevated/50 px-3 py-1.5 text-[12px] text-muted-foreground transition hover:border-accent/40 hover:text-foreground"
          >
            <Settings className="h-3 w-3" />
            Manage connections
          </Link>
        )}
      </header>

      {error && (
        <div className="flex items-start gap-2 border border-accent/30 bg-accent/10 p-3 text-xs text-accent">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="text-foreground/85">{error}</span>
        </div>
      )}

      {connections === null ? (
        <RestoringFrame />
      ) : connections.length === 0 ? (
        <EmptyState isOwner={!!user} />
      ) : (
        <>
          <ConnectionStrip
            connections={connections}
            activeId={activeId}
            onSelect={setActiveId}
            currentUserId={user?.id ?? null}
          />
          <div className="min-w-0">
            {active ? (
              <DrillDown connection={active} key={active.id} />
            ) : (
              <div className="flex min-h-[12rem] items-center justify-center border border-border bg-bg-elevated/40 text-sm text-text-dim">
                Pick a connection
              </div>
            )}
          </div>
        </>
      )}
    </main>
  );
}

// Horizontal picker. Pills wrap onto a second line if there are many,
// rather than scrolling sideways — keeps every option visible at a
// glance. Each pill carries ownership info inline (crown for yours;
// "by @alice" subtitle for shared) so users know the provenance at a
// quick scan.
function ConnectionStrip({
  connections,
  activeId,
  onSelect,
  currentUserId,
}: {
  connections: StorageConnection[];
  activeId: string | null;
  onSelect: (id: string) => void;
  currentUserId: string | null;
}) {
  return (
    <ul className="flex flex-wrap items-stretch gap-2">
      {connections.map((c) => (
        <li key={c.id}>
          <ConnectionPill
            connection={c}
            active={c.id === activeId}
            mine={!!currentUserId && c.ownerId === currentUserId}
            onClick={() => onSelect(c.id)}
          />
        </li>
      ))}
    </ul>
  );
}

function ConnectionPill({
  connection: c,
  active,
  mine,
  onClick,
}: {
  connection: StorageConnection;
  active: boolean;
  mine: boolean;
  onClick: () => void;
}) {
  const ownerName = c.ownerDisplayName?.trim() || (c.ownerUsername ? `@${c.ownerUsername}` : "space owner");
  const ownerLabel = mine ? "yours" : `by ${ownerName}`;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      title={mine ? "Owned by you" : `Shared by ${ownerName}`}
      className={cn(
        "flex items-center gap-2 border px-3 py-2 text-left transition",
        active
          ? "border-accent/50 bg-accent/10 text-foreground"
          : "border-border bg-bg-elevated/40 text-muted-foreground hover:border-border-hover hover:bg-bg-elevated/70 hover:text-foreground",
      )}
    >
      <Database className={cn("h-3.5 w-3.5 shrink-0", active ? "text-accent" : "text-text-dim")} />
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="flex items-center gap-1.5 truncate text-sm">
          <span className="truncate">{c.label}</span>
          {mine && <Crown className="h-3 w-3 shrink-0 text-amber-300" aria-label="Owned by you" />}
        </span>
        <span className="truncate font-mono text-[10px] text-text-dim">
          {ownerLabel} · {c.provider} · {c.bucket}
        </span>
      </span>
    </button>
  );
}

// Fetches the cleartext secret via ECDH on mount, builds the
// Connection, hands it to StorageWorkspace.
function DrillDown({ connection: summary }: { connection: StorageConnection }) {
  const [conn, setConn] = useState<Connection | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setConn(null);
    setError("");
    loadFullConnection(summary)
      .then((c) => {
        if (!cancelled) setConn(c);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message || "Failed to fetch credentials");
      });
    return () => {
      cancelled = true;
    };
  }, [summary.id, summary.updatedAt]);

  if (error) {
    return (
      <div className="flex items-start gap-2 border border-accent/30 bg-accent/10 p-3 text-xs text-accent">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span className="text-foreground/85">{error}</span>
      </div>
    );
  }
  if (!conn) {
    return (
      <div className="flex min-h-[12rem] items-center justify-center gap-2 border border-border bg-bg-elevated/40 text-xs text-text-dim">
        <Loader2 className="h-4 w-4 animate-spin" />
        Fetching credentials for {summary.label}…
      </div>
    );
  }
  return <StorageWorkspace connection={conn} />;
}

function EmptyState({ isOwner }: { isOwner: boolean }) {
  return (
    <div className="border border-border bg-bg-elevated/40 p-10 text-center">
      <Database className="mx-auto h-6 w-6 text-text-dim" />
      <p className="mt-3 text-sm text-foreground">No storage available in this space.</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {isOwner
          ? "Open settings to add a connection and activate it here."
          : "The space owner hasn't shared any storage with you yet."}
      </p>
      {isOwner && (
        <Link
          to="/settings/storage"
          className="mt-4 inline-flex items-center gap-1.5 border border-border bg-bg-elevated/60 px-3 py-1.5 text-[12px] text-foreground transition hover:border-accent/40"
        >
          <Settings className="h-3 w-3" />
          Manage connections
        </Link>
      )}
    </div>
  );
}

function RestoringFrame() {
  return (
    <div className="flex min-h-[10rem] flex-col items-center justify-center gap-3 border border-border bg-bg-elevated/40 text-center">
      <Loader2 className="h-5 w-5 animate-spin text-accent/90" />
      <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Loading…</span>
    </div>
  );
}
