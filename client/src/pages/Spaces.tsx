import { useEffect, useState, type FormEvent } from "react";
import { Check, Copy, Loader2, Pencil, Plus, Trash2, Users, X } from "lucide-react";
import type { InviteCode, JoinRequest, Space, SpaceJoinPolicy, SpaceMember, SpaceRole } from "@shared/protocol";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSessionPresence } from "@/auth/SessionPresence";
import { useToast } from "@/components/Toast";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

// Sub-components used by /settings/space. This file used to host a
// standalone /spaces page; that route now redirects into Settings, so
// only the building blocks remain here.

export function CreateSpaceCard({ onCancel, onCreated }: { onCancel: () => void; onCreated: (space: Space) => void }) {
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (pending) return;
    setError("");
    setPending(true);
    try {
      const space = await api.createSpace({ name: name.trim() });
      onCreated(space);
    } catch (err) {
      setError((err as Error).message);
      setPending(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4 border border-border bg-bg-elevated/40 p-6">
      <div>
        <h2 className="text-base font-medium text-foreground">Create a new space</h2>
        <p className="mt-1 text-sm text-muted-foreground">A space has its own library, playlists, storage backend, and members.</p>
      </div>
      <label className="block">
        <span className="section-label muted mb-1.5 block">Name</span>
        <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Family movie night" required />
      </label>
      {error && <div className="border border-accent/40 bg-accent/10 px-3 py-2 font-mono text-[12px] text-foreground">{error}</div>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" variant="accent" disabled={pending || !name.trim()}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Create space
        </Button>
      </div>
    </form>
  );
}

// Exported so /settings/space can render the same panel for just
// the currently active space without duplicating the
// fetch/render/danger-zone logic.
export function SpaceDetailCard({
  spaceId,
  onChanged,
  onDeleted,
}: {
  spaceId: string;
  onChanged: () => Promise<void>;
  onDeleted: () => Promise<void>;
}) {
  const { joinRequestSignal } = useSessionPresence();
  const [data, setData] = useState<{ space: Space; members: SpaceMember[]; invites: InviteCode[]; role: SpaceRole } | null>(null);
  const [pendingRequests, setPendingRequests] = useState<JoinRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      setData(await api.getSpace(spaceId));
      setError("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // Only owners are authorized to read the pending list; the API
  // returns 403 otherwise. Cheaper than gating client-side because
  // we'd have to wait on `data.role` to settle first.
  const loadPending = async () => {
    try {
      const list = await api.listJoinRequests(spaceId);
      setPendingRequests(list);
    } catch {
      setPendingRequests([]);
    }
  };

  useEffect(() => {
    void load();
    void loadPending();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spaceId]);

  // WebSocket nudge: server fans "joinRequestPending" to the space,
  // SessionPresence bumps the signal, we refetch.
  useEffect(() => {
    if (joinRequestSignal === 0) return;
    void loadPending();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joinRequestSignal]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 border border-border bg-bg-elevated/40 p-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading space…
      </div>
    );
  }
  if (error || !data) {
    return <div className="border border-accent/30 bg-accent/10 p-3 text-sm text-accent">{error || "Couldn't load space."}</div>;
  }

  const { space, members, invites, role } = data;
  const isOwner = role === "owner";

  return (
    <div className="space-y-6">
      <header className="space-y-1 border border-border bg-bg-elevated/40 p-4 sm:p-6">
        <span className="section-label muted">Space</span>
        <SpaceTitleEditor
          name={space.name}
          canEdit={isOwner}
          onRename={async (next) => {
            await api.renameSpace(spaceId, next);
            await load();
            await onChanged();
          }}
        />
        <p className="font-mono text-[11px] text-text-dim">
          {members.length} {members.length === 1 ? "member" : "members"} · you are {role}
        </p>
      </header>

      <section>
        <header className="mb-2 flex items-center justify-between">
          <span className="section-label muted">Members</span>
        </header>
        <ul className="border border-border">
          {members.map((m) => {
            const hasDisplayName = !!m.displayName?.trim();
            return (
            <li key={m.userId} className="flex items-center gap-3 border-b border-border px-3 py-2 last:border-b-0">
              <Users className="h-3.5 w-3.5 text-text-dim" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-foreground">
                  {hasDisplayName ? m.displayName : `@${m.username}`}
                </div>
                <div className="font-mono text-[10px] text-text-dim">
                  {hasDisplayName ? `@${m.username} · ${m.role}` : m.role}
                </div>
              </div>
              {isOwner && m.role !== "owner" && (
                <button
                  type="button"
                  onClick={async () => {
                    if (!confirm(`Remove @${m.username} from this space?`)) return;
                    await api.removeMember(spaceId, m.userId);
                    await load();
                  }}
                  aria-label={`Remove @${m.username}`}
                  title="Remove from space"
                  className="flex h-7 w-7 shrink-0 items-center justify-center text-text-dim transition hover:text-accent"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
            );
          })}
        </ul>
      </section>

      {isOwner && (
        <JoinPolicyPanel
          space={space}
          onChange={async (next) => {
            await api.setSpaceJoinPolicy(spaceId, next);
            await load();
          }}
        />
      )}

      {isOwner && pendingRequests.length > 0 && (
        <PendingRequestsPanel
          requests={pendingRequests}
          onApprove={async (id) => {
            await api.approveJoinRequest(spaceId, id);
            await loadPending();
            await load();
          }}
          onDeny={async (id) => {
            await api.denyJoinRequest(spaceId, id);
            await loadPending();
          }}
        />
      )}

      {isOwner && (
        <section>
          <header className="mb-2 flex items-center justify-between">
            <span className="section-label muted">Invites</span>
            <Button
              variant="accent"
              size="sm"
              onClick={async () => {
                await api.createInvite(spaceId);
                await load();
              }}
              title="Mint an invite link. Recipients choose at the join page whether to enter as a member (sign in / create account) or as a guest."
              aria-label="Create invite link"
              className="h-9"
            >
              <Plus className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Create invite link</span>
            </Button>
          </header>
          {invites.length === 0 ? (
            <div className="border border-border bg-bg-elevated/40 px-4 py-6 text-center text-sm text-muted-foreground">
              No invite links yet. One link → share with anyone; they pick whether to join as a guest or a member.
            </div>
          ) : (
            <ul className="border border-border">
              {invites.map((inv) => (
                <InviteRow key={inv.code} invite={inv} onRevoke={async () => { await api.revokeInvite(spaceId, inv.code); await load(); }} />
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="border border-border bg-bg-elevated/40 p-4 sm:p-6">
        <span className="section-label muted">Danger zone</span>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {isOwner ? (
            <Button
              variant="destructive"
              size="sm"
              onClick={async () => {
                if (!confirm(`Delete "${space.name}"? Library, playlists, imports, and storage config for this space will be removed.`)) return;
                await api.deleteSpace(spaceId);
                await onChanged();
                await onDeleted();
              }}
            >
              Delete space
            </Button>
          ) : (
            <Button
              variant="destructive"
              size="sm"
              onClick={async () => {
                if (!confirm(`Leave "${space.name}"?`)) return;
                await api.leaveSpace(spaceId);
                await onChanged();
                await onDeleted();
              }}
            >
              Leave space
            </Button>
          )}
          <span className="font-mono text-[11px] text-text-dim">
            {isOwner ? "This will cascade-delete library + playlists." : "You'll lose access to library + playlists in this space."}
          </span>
        </div>
      </section>
    </div>
  );
}

export function RedeemInline({ onRedeemed }: { onRedeemed: () => Promise<void> }) {
  const toast = useToast();
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const submit = async () => {
    if (!code.trim() || pending) return;
    setPending(true);
    try {
      const result = await api.redeemInvite(code.trim());
      setCode("");
      if (result.pending) {
        // joinPolicy = "approval" on the target space — there's no
        // session change yet. Surface the wait status as a toast; the
        // user can refresh manually once approved (or use a shared
        // link to land on the waiting-room flow).
        toast.info(`Request sent to "${result.spaceName}" — waiting for approval`);
      } else if (result.alreadyMember) {
        toast.info("Already a member");
      } else {
        toast.success(`Joined "${result.space.name}"`);
        await onRedeemed();
      }
    } catch (err) {
      toast.error((err as Error).message || "Couldn't redeem code");
    } finally {
      setPending(false);
    }
  };
  // Single-row layout. The previous version stacked an inline message
  // under the input; that made this component taller than the
  // sibling "+ New space" button and broke vertical alignment in the
  // strip. Toasts are the right surface for transient feedback.
  return (
    <div className="flex items-center gap-2">
      <input
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="invite code"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        className="h-9 w-28 border border-border bg-input/60 px-2 font-mono text-xs focus-visible:border-accent/60 focus-visible:outline-none"
      />
      <Button variant="outline" size="sm" disabled={pending || !code.trim()} onClick={() => void submit()}>
        Join
      </Button>
    </div>
  );
}

// Single invite row. Shows the code, uses/expiry, and copy controls.
// The link copy gives the full `/join/<code>` URL for direct sharing;
// the code copy is the hyphenated form so it's easy to read aloud or
// type at /join.
function InviteRow({ invite, onRevoke }: { invite: InviteCode; onRevoke: () => Promise<void> }) {
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const hyphenated = invite.code.length === 8 ? `${invite.code.slice(0, 4)}-${invite.code.slice(4)}` : invite.code;

  const copy = async (kind: "code" | "link") => {
    const value = kind === "code" ? hyphenated : `${window.location.origin}/join/${invite.code}`;
    await navigator.clipboard.writeText(value).catch(() => undefined);
    setCopied(kind);
    setTimeout(() => setCopied(null), 1500);
  };

  const expiresIn =
    invite.expiresAt === null
      ? "never expires"
      : invite.expiresAt < Date.now()
        ? "expired"
        : `expires ${formatRelative(invite.expiresAt - Date.now())}`;

  return (
    <li className="flex items-start gap-3 border-b border-border px-3 py-2.5 last:border-b-0">
      <div className="min-w-0 flex-1">
        <code className="font-mono text-sm tracking-wider text-foreground">{hyphenated}</code>
        <div className="mt-0.5 font-mono text-[10px] text-text-dim">
          {invite.usesRemaining === null ? "unlimited" : `${invite.usesRemaining} left`} · {expiresIn}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={() => void copy("link")}
          aria-label="Copy join link"
          title="Copy /join/<code> URL"
          className="border border-border px-2 py-0.5 font-mono text-[10px] text-muted-foreground transition hover:border-border-hover hover:text-foreground"
        >
          {copied === "link" ? "copied" : "link"}
        </button>
        <button
          type="button"
          onClick={() => void copy("code")}
          aria-label="Copy code"
          title="Copy just the code"
          className="flex h-7 w-7 items-center justify-center text-text-dim transition hover:text-foreground"
        >
          {copied === "code" ? <span className="font-mono text-[10px]">✓</span> : <Copy className="h-3.5 w-3.5" />}
        </button>
        <button
          type="button"
          onClick={() => void onRevoke()}
          aria-label="Revoke"
          className="flex h-7 w-7 items-center justify-center text-text-dim transition hover:text-accent"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </li>
  );
}

// Humanize a positive duration in ms as "in 6h" / "in 3d".
function formatRelative(ms: number): string {
  if (ms < 60_000) return "in <1m";
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `in ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `in ${hours}h`;
  const days = Math.floor(hours / 24);
  return `in ${days}d`;
}

// Inline title editor. Click the pencil → edit-in-place input with
// save/cancel. Save triggers the parent's rename callback. Members
// (non-owners) just see the static title with no pencil.
function SpaceTitleEditor({
  name,
  canEdit,
  onRename,
}: {
  name: string;
  canEdit: boolean;
  onRename: (next: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  // Whenever we leave edit mode, re-seed the draft from the truth so a
  // cancelled rename doesn't leave a stale value in the input on next open.
  useEffect(() => {
    if (!editing) setDraft(name);
  }, [editing, name]);

  const cancel = () => {
    setEditing(false);
    setError("");
  };

  const save = async () => {
    const next = draft.trim();
    if (!next) {
      setError("Name can't be empty");
      return;
    }
    if (next === name) {
      cancel();
      return;
    }
    setPending(true);
    setError("");
    try {
      await onRename(next);
      setEditing(false);
    } catch (err) {
      setError((err as Error).message || "Couldn't rename");
    } finally {
      setPending(false);
    }
  };

  if (!editing) {
    return (
      <div className="flex items-center gap-2">
        <h2 className="text-xl font-medium text-foreground">{name}</h2>
        {canEdit && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            aria-label="Rename space"
            title="Rename space"
            className="flex h-7 w-7 items-center justify-center text-text-dim transition hover:text-foreground"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <Input
          autoFocus
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setError("");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") void save();
            if (e.key === "Escape") cancel();
          }}
          maxLength={80}
          disabled={pending}
          className="h-9 text-lg"
        />
        <Button variant="accent" size="icon" disabled={pending} onClick={() => void save()} aria-label="Save name">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
        </Button>
        <Button variant="ghost" size="icon" disabled={pending} onClick={cancel} aria-label="Cancel">
          <X className="h-4 w-4" />
        </Button>
      </div>
      {error && <p className="font-mono text-[11px] text-accent">{error}</p>}
    </div>
  );
}


// Join-policy chooser. Owner-only — gates whether invite redemption is
// instant ("open") or routes through a per-request approval queue.
// New spaces default to "open" so the canonical watch-along flow
// stays frictionless; approval is the opt-in for stricter spaces.
function JoinPolicyPanel({ space, onChange }: { space: Space; onChange: (next: SpaceJoinPolicy) => Promise<void> }) {
  const [busy, setBusy] = useState<SpaceJoinPolicy | null>(null);
  const pick = async (next: SpaceJoinPolicy) => {
    if (busy || next === space.joinPolicy) return;
    setBusy(next);
    try {
      await onChange(next);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="border border-border bg-bg-elevated/40 p-4 sm:p-6">
      <header className="mb-3">
        <span className="section-label muted">Join policy</span>
        <p className="mt-1 font-mono text-[11px] text-text-dim">
          Open = anyone with a valid invite link joins instantly. Approval = each redemption creates a pending request you review here.
        </p>
      </header>
      <div className="grid gap-2 sm:grid-cols-2">
        <PolicyOption
          label="Open"
          desc="Frictionless. Default."
          active={space.joinPolicy === "open"}
          busy={busy === "open"}
          onClick={() => void pick("open")}
        />
        <PolicyOption
          label="Approval"
          desc="You approve each join. Adds friction; useful for vetted spaces."
          active={space.joinPolicy === "approval"}
          busy={busy === "approval"}
          onClick={() => void pick("approval")}
        />
      </div>
    </section>
  );
}

function PolicyOption({ label, desc, active, busy, onClick }: { label: string; desc: string; active: boolean; busy: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      disabled={busy}
      className={cn(
        "flex flex-col items-start gap-1 border px-3 py-2.5 text-left transition",
        active
          ? "border-accent/50 bg-accent/10"
          : "border-border bg-bg-elevated/40 hover:border-border-hover hover:bg-bg-elevated/70",
      )}
    >
      <span className="flex items-center gap-2 text-sm font-medium text-foreground">
        {label}
        {active && <Check className="h-3.5 w-3.5 text-accent" />}
        {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-text-dim" />}
      </span>
      <span className="font-mono text-[10px] text-text-dim">{desc}</span>
    </button>
  );
}

// Per-request row in the admin queue. Approve = run the same write
// the "open" path would have run, plus deliver a cookie back to the
// joiner on their next status poll. Deny just marks the request.
function PendingRequestsPanel({
  requests,
  onApprove,
  onDeny,
}: {
  requests: JoinRequest[];
  onApprove: (id: string) => Promise<void>;
  onDeny: (id: string) => Promise<void>;
}) {
  return (
    <section>
      <header className="mb-2 flex items-center justify-between">
        <span className="section-label muted">Pending join requests · {requests.length}</span>
      </header>
      <ul className="border border-border">
        {requests.map((r) => (
          <PendingRow key={r.id} request={r} onApprove={onApprove} onDeny={onDeny} />
        ))}
      </ul>
    </section>
  );
}

function PendingRow({
  request,
  onApprove,
  onDeny,
}: {
  request: JoinRequest;
  onApprove: (id: string) => Promise<void>;
  onDeny: (id: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState<"approve" | "deny" | null>(null);
  const act = async (kind: "approve" | "deny") => {
    if (busy) return;
    setBusy(kind);
    try {
      if (kind === "approve") await onApprove(request.id);
      else await onDeny(request.id);
    } finally {
      setBusy(null);
    }
  };
  const who =
    request.requester.kind === "user"
      ? request.requester.displayName?.trim() || `@${request.requester.username}`
      : request.requester.displayName;
  const tag = request.requester.kind === "user" ? "member" : "guest";
  return (
    <li className="flex flex-wrap items-center gap-3 border-b border-border px-3 py-2.5 last:border-b-0">
      <Users className="h-3.5 w-3.5 shrink-0 text-text-dim" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm text-foreground">{who}</div>
        <div className="font-mono text-[10px] text-text-dim">{tag} · expires in {formatRelative(request.expiresAt - Date.now())}</div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => void act("deny")}>
          {busy === "deny" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
          Deny
        </Button>
        <Button variant="accent" size="sm" disabled={busy !== null} onClick={() => void act("approve")}>
          {busy === "approve" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          Approve
        </Button>
      </div>
    </li>
  );
}

