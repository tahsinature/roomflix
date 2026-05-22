import { useEffect, useState } from "react";
import { Crown, Database, MonitorPlay, Pause, Play, User, Users, Volume2, VolumeX } from "lucide-react";
import type { StorageConnectionDetail, Volume } from "@shared/protocol";
import { Modal } from "@/components/Modal";
import { useAuth } from "@/auth/AuthContext";
import { useSessionPresence } from "@/auth/SessionPresence";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

// Static identity bits captured at click time (these don't change for
// the duration the modal is open). Live presence/volume/tabs come from
// useSessionPresence inside the modal so the panel stays current with
// every WS broadcast.
export type MemberDetailKey = {
  identityId: string;
  role: "owner" | "member" | "guest";
  name: string;
  username?: string | null;
  isMe: boolean;
  memberJoinedAt?: number;
};

export function MemberDetailModal({ detail, onClose }: { detail: MemberDetailKey | null; onClose: () => void }) {
  return (
    <Modal open={!!detail} title="In this space" onClose={onClose} className="max-w-lg">
      {detail && <Body keyData={detail} />}
    </Modal>
  );
}

function Body({ keyData }: { keyData: MemberDetailKey }) {
  const { currentSpace } = useAuth();
  const { participants, state } = useSessionPresence();
  // Look up the live participant every render — this keeps presence,
  // volume, and tab counts in sync with WS broadcasts even while the
  // modal is open.
  const participant = participants.find((p) => p.id === keyData.identityId);
  const status = participant?.status ?? "offline";
  const playing = !!state?.playing;
  const isGuest = keyData.role === "guest";

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-center gap-4">
        <span
          className={cn(
            "inline-flex h-12 w-12 shrink-0 items-center justify-center border",
            isGuest ? "border-amber-300/30 bg-amber-300/10 text-amber-200" : "border-accent/30 bg-accent/10 text-accent",
          )}
        >
          {keyData.role === "owner" ? <Crown className="h-5 w-5" /> : <User className="h-5 w-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className={cn("truncate text-base font-medium text-foreground", isGuest && "italic")}>{keyData.name}</h4>
            {keyData.isMe && <Pill>you</Pill>}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-[11px] text-text-dim">
            <span className="uppercase tracking-[0.14em]">{keyData.role}</span>
            {keyData.username && <span>· @{keyData.username}</span>}
          </div>
        </div>
      </header>

      <Row label="Presence">
        <PresenceLine status={status} playing={playing} />
      </Row>

      {status === "watching" && (
        <Row label="Volume">{participant?.volume ? <VolumeRow volume={participant.volume} /> : <span className="font-mono text-[12px] text-text-dim">—</span>}</Row>
      )}

      <Row label={isGuest ? "Paired" : "Joined space"}>
        <span className="font-mono text-[12px] text-foreground/85">
          {isGuest ? (participant?.guestJoinedAt ? formatRelative(participant.guestJoinedAt) : "—") : keyData.memberJoinedAt ? formatRelative(keyData.memberJoinedAt) : "—"}
        </span>
      </Row>

      {participant && (
        <Row label="Tabs open">
          <TabsLine tabs={participant.tabs} />
        </Row>
      )}

      <StorageAccessRow identityId={keyData.identityId} isGuest={isGuest} currentSpaceId={currentSpace?.id ?? null} />
    </div>
  );
}

// Lists storage connections this identity has access to in the
// current space, from the viewer's vantage. The viewer must own the
// connections to see them in their own listing — so for non-owner
// viewers the row is empty and we hide it silently.
//
// Access rule (matches server):
//   - guest:  activation in their current space with openToGuests=true
//   - member: any activation in any space they're a member of (we only
//             know the current space context here, so list those)
function StorageAccessRow({ isGuest, currentSpaceId }: { identityId: string; isGuest: boolean; currentSpaceId: string | null }) {
  const [details, setDetails] = useState<StorageConnectionDetail[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setDetails(null);
    setError("");
    api
      .listStorageConnections()
      .then((list) => {
        if (!cancelled) setDetails(list);
      })
      .catch((err: Error) => {
        if (!cancelled) {
          if (err.message?.toLowerCase().includes("unauthorized")) {
            setDetails([]);
          } else {
            setError(err.message);
          }
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (details === null) {
    return (
      <Row label="Storage access">
        <span className="font-mono text-[12px] text-text-dim">…</span>
      </Row>
    );
  }
  if (error) {
    return (
      <Row label="Storage access">
        <span className="font-mono text-[12px] text-accent">{error}</span>
      </Row>
    );
  }

  const accessible = details.filter((d) => {
    if (!currentSpaceId) return false;
    const act = d.activations.find((a) => a.spaceId === currentSpaceId);
    if (!act) return false;
    return isGuest ? !!act.openToGuests : true;
  });

  if (accessible.length === 0) {
    return (
      <Row label="Storage access">
        <span className="font-mono text-[12px] text-text-dim">None in this space</span>
      </Row>
    );
  }
  return (
    <Row label="Storage access">
      <ul className="inline-flex flex-col items-end gap-1">
        {accessible.map((d) => (
          <li key={d.connection.id} className="inline-flex items-center gap-1.5 font-mono text-[11px] text-foreground/85">
            <Database className="h-3 w-3 text-text-dim" />
            <span className="truncate">{d.connection.label}</span>
            <span className="text-text-dim">· {d.connection.bucket}</span>
          </li>
        ))}
      </ul>
    </Row>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-t border-border pt-3">
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-dim">{label}</span>
      <span className="min-w-0 flex-1 text-right">{children}</span>
    </div>
  );
}

function PresenceLine({ status, playing }: { status: "online" | "watching" | "offline"; playing: boolean }) {
  if (status === "watching") {
    return (
      <span className="inline-flex items-center gap-2 text-emerald-300">
        {playing ? <Play className="h-3 w-3 fill-current" /> : <Pause className="h-3 w-3 fill-current" />}
        <span className="font-mono text-[12px] uppercase tracking-[0.14em]">{playing ? "Watching" : "Joined (paused)"}</span>
      </span>
    );
  }
  if (status === "online") {
    return (
      <span className="inline-flex items-center gap-2 text-cyan-300">
        <MonitorPlay className="h-3 w-3" />
        <span className="font-mono text-[12px] uppercase tracking-[0.14em]">Online elsewhere</span>
      </span>
    );
  }
  return <span className="font-mono text-[12px] uppercase tracking-[0.14em] text-text-dim">Offline</span>;
}

function VolumeRow({ volume }: { volume: Volume }) {
  const effectivelyMuted = volume.muted || volume.level === 0;
  const pct = Math.round(volume.level * 100);
  if (effectivelyMuted) {
    return (
      <span className="inline-flex items-center gap-2 text-text-dim">
        <VolumeX className="h-3.5 w-3.5" />
        <span className="font-mono text-[12px] uppercase tracking-[0.14em]">Muted</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2 text-emerald-300">
      <Volume2 className="h-3.5 w-3.5" />
      <span className="flex h-3 items-end gap-[2px]">
        <span className={cn("w-[3px] bg-current transition-opacity", pct >= 1 ? "h-1 opacity-100" : "h-1 opacity-20")} />
        <span className={cn("w-[3px] bg-current transition-opacity", pct >= 33 ? "h-2 opacity-100" : "h-2 opacity-20")} />
        <span className={cn("w-[3px] bg-current transition-opacity", pct >= 66 ? "h-3 opacity-100" : "h-3 opacity-20")} />
      </span>
      <span className="font-mono text-[12px] tabular-nums">{pct}%</span>
    </span>
  );
}

function TabsLine({ tabs }: { tabs: { total: number; watching: number; online: number } }) {
  if (tabs.total === 0) return <span className="font-mono text-[12px] text-text-dim">0 tabs</span>;
  if (tabs.total === 1) {
    return (
      <span className="inline-flex items-center gap-2 font-mono text-[12px] text-foreground/85">
        <Users className="h-3 w-3 text-text-dim" />1 tab {tabs.watching > 0 ? "(watching)" : "(elsewhere)"}
      </span>
    );
  }
  const parts: string[] = [];
  if (tabs.watching > 0) parts.push(`${tabs.watching} watching`);
  if (tabs.online > 0) parts.push(`${tabs.online} elsewhere`);
  return (
    <span className="inline-flex items-center gap-2 font-mono text-[12px] text-foreground/85">
      <Users className="h-3 w-3 text-text-dim" />
      {tabs.total} tabs ({parts.join(" · ")})
    </span>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center border border-border bg-bg-elevated/40 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-text-dim">
      {children}
    </span>
  );
}

function formatRelative(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 0) return "just now";
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(ms).toISOString().slice(0, 10);
}
