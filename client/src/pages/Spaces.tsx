import { useEffect, useState, type FormEvent } from "react";
import { Check, Copy, KeyRound, Loader2, Pencil, RefreshCw, Trash2, Users, X } from "lucide-react";
import type { InviteCode, Space, SpaceMember, SpaceRole } from "@shared/protocol";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdmitGuestDialog } from "@/components/AdmitGuestDialog";
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
  const [data, setData] = useState<{ space: Space; members: SpaceMember[]; invites: InviteCode[]; role: SpaceRole } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [admitGuestOpen, setAdmitGuestOpen] = useState(false);

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

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spaceId]);

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
        <section>
          <header className="mb-2 flex items-center justify-between">
            <span className="section-label muted">Invites</span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  await api.createInvite(spaceId, { kind: "member" });
                  await load();
                }}
                title="Mint a code that requires the recipient to register or sign in."
                aria-label="New member invite code"
                className="h-9"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Member code</span>
              </Button>
              <Button
                variant="accent"
                size="sm"
                onClick={async () => {
                  await api.createInvite(spaceId, { kind: "guest" });
                  await load();
                }}
                title="Mint a code for someone joining without an account. Default: 7-day expiry, unlimited uses."
                aria-label="New guest invite code"
                className="h-9"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Guest code</span>
              </Button>
            </div>
          </header>
          {invites.length === 0 ? (
            <div className="border border-border bg-bg-elevated/40 px-4 py-6 text-center text-sm text-muted-foreground">
              No invite codes yet. Mint a "Member code" for someone you want to add as a real account, or a "Guest code" for a one-off watch-along.
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

      {isOwner && (
        <section className="border border-border bg-bg-elevated/40 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium text-foreground">Admit a guest by code</div>
              <p className="mt-0.5 text-[12px] text-muted-foreground">
                They get an 8-digit pairing code on their device; you type it here to admit them on the spot.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setAdmitGuestOpen(true)}>
              <KeyRound className="h-3.5 w-3.5" />
              Admit a guest
            </Button>
          </div>
        </section>
      )}

      <AdmitGuestDialog open={admitGuestOpen} onClose={() => setAdmitGuestOpen(false)} />

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
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const submit = async () => {
    if (!code.trim() || pending) return;
    setPending(true);
    setMessage("");
    try {
      const result = await api.redeemInvite(code.trim());
      setCode("");
      setMessage(result.alreadyMember ? "Already a member" : `Joined "${result.space.name}"`);
      await onRedeemed();
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setPending(false);
    }
  };
  return (
    // Wraps the message under the input row so a long error doesn't
    // overflow into adjacent sections on the narrow sidebar.
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <input
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            setMessage("");
          }}
          placeholder="invite code"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          className="h-8 w-28 border border-border bg-input/60 px-2 font-mono text-xs focus-visible:border-accent/60 focus-visible:outline-none"
        />
        <Button variant="outline" size="sm" disabled={pending || !code.trim()} onClick={() => void submit()}>
          Join
        </Button>
      </div>
      {message && <p className="break-words font-mono text-[10px] text-text-dim">{message}</p>}
    </div>
  );
}

// Single invite row. Shows the code, kind ("guest" | "member"), uses /
// expiry, and copy controls — for guest codes the primary copy gives the
// full /join/<code> URL so the recipient can click it directly.
function InviteRow({ invite, onRevoke }: { invite: InviteCode; onRevoke: () => Promise<void> }) {
  const [copied, setCopied] = useState<"code" | "link" | null>(null);

  const copy = async (kind: "code" | "link") => {
    const value = kind === "code" ? invite.code : `${window.location.origin}/join/${invite.code}`;
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
        <div className="flex flex-wrap items-center gap-2">
          <code className="font-mono text-sm tracking-wider text-foreground">{invite.code}</code>
          <span
            className={cn(
              "border px-1.5 py-0.5 font-mono text-[10px] uppercase",
              invite.kind === "guest" ? "border-accent/40 text-accent" : "border-border text-text-dim",
            )}
          >
            {invite.kind}
          </span>
        </div>
        <div className="mt-0.5 font-mono text-[10px] text-text-dim">
          {invite.usesRemaining === null ? "unlimited" : `${invite.usesRemaining} left`} · {expiresIn}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {invite.kind === "guest" && (
          <button
            type="button"
            onClick={() => void copy("link")}
            aria-label="Copy join link"
            title="Copy /join/<code> URL"
            className="border border-border px-2 py-0.5 font-mono text-[10px] text-muted-foreground transition hover:border-border-hover hover:text-foreground"
          >
            {copied === "link" ? "copied" : "link"}
          </button>
        )}
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
