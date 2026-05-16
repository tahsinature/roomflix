import { useEffect, useState } from "react";
import { AlertTriangle, Cloud, Database, HardDrive, Loader2, Pencil, Plus, Sparkles, Trash2, Users2, X } from "lucide-react";
import type { StorageConnectionDetail } from "@shared/protocol";
import { Button } from "@/components/ui/button";
import { ConnectForm } from "@/components/storage/ConnectForm";
import { Modal } from "@/components/Modal";
import { useAuth } from "@/auth/AuthContext";
import { api } from "@/lib/api";
import { invalidateSecret } from "@/lib/buckets/session";
import type { Connection } from "@/lib/buckets/types";
import { cn } from "@/lib/utils";

// Account-level storage CRUD. Lives under /settings/storage. The
// create + edit flows live in a modal so the page body stays focused
// on the list — no scrolling past a form to reach existing
// connections. The per-space /storage page is read-only and lists
// what's usable in the current space.

const PROVIDERS: Array<{
  id: "r2" | "s3" | "b2" | "wasabi";
  name: string;
  enabled: boolean;
  icon: React.ReactNode;
}> = [
  { id: "r2", name: "Cloudflare R2", enabled: true, icon: <Cloud className="h-4 w-4" /> },
  { id: "s3", name: "AWS S3", enabled: false, icon: <Cloud className="h-4 w-4" /> },
  { id: "b2", name: "Backblaze B2", enabled: false, icon: <HardDrive className="h-4 w-4" /> },
  { id: "wasabi", name: "Wasabi", enabled: false, icon: <HardDrive className="h-4 w-4" /> },
];

type FormState = { kind: "create"; provider: "r2" } | { kind: "edit"; detail: StorageConnectionDetail } | null;

export default function SettingsStorage() {
  const [details, setDetails] = useState<StorageConnectionDetail[] | null>(null);
  const [error, setError] = useState("");
  const [form, setForm] = useState<FormState>(null);

  const load = async () => {
    setError("");
    try {
      const list = await api.listStorageConnections();
      setDetails(list);
    } catch (err) {
      setError((err as Error).message || "Failed to load connections");
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleCreated = (detail: StorageConnectionDetail) => {
    setDetails((prev) => [detail, ...(prev ?? [])]);
    setForm(null);
  };

  const handleUpdated = (detail: StorageConnectionDetail) => {
    invalidateSecret(detail.connection.id);
    setDetails((prev) => (prev ?? []).map((d) => (d.connection.id === detail.connection.id ? detail : d)));
    setForm(null);
  };

  const handleSharingChanged = (detail: StorageConnectionDetail) => {
    setDetails((prev) => (prev ?? []).map((d) => (d.connection.id === detail.connection.id ? detail : d)));
  };

  const handleDeleted = async (id: string) => {
    try {
      await api.deleteStorageConnection(id);
      invalidateSecret(id);
      setDetails((prev) => (prev ?? []).filter((d) => d.connection.id !== id));
    } catch (err) {
      setError((err as Error).message || "Failed to delete");
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <section>
        <header className="mb-3 flex items-center justify-between">
          <div>
            <span className="section-label muted">Add a connection</span>
            <p className="mt-1 font-mono text-[11px] text-text-dim">Pick a provider to add a new bucket.</p>
          </div>
        </header>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {PROVIDERS.map((p) => (
            <ProviderButton key={p.id} icon={p.icon} name={p.name} enabled={p.enabled} onClick={() => p.enabled && p.id === "r2" && setForm({ kind: "create", provider: "r2" })} />
          ))}
        </div>
      </section>

      {error && (
        <div className="flex items-start justify-between gap-2 border border-accent/30 bg-accent/10 p-3 text-xs">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
            <span className="text-foreground/85">{error}</span>
          </div>
          <button type="button" onClick={() => setError("")} className="text-accent/70 hover:text-accent" aria-label="Dismiss">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <ProvidedByRoomflixSection />

      <section>
        <header className="mb-3">
          <span className="section-label muted">Your connections</span>
          <p className="mt-1 font-mono text-[11px] text-text-dim">Bring-your-own buckets. You manage the credentials and which spaces they activate in.</p>
        </header>
        {details === null ? (
          <RestoringFrame />
        ) : details.length === 0 ? (
          <EmptyState onAdd={() => setForm({ kind: "create", provider: "r2" })} />
        ) : (
          <ul className="flex flex-col gap-3">
            {details.map((d) => (
              <li key={d.connection.id}>
                <ConnectionCard detail={d} onEdit={() => setForm({ kind: "edit", detail: d })} onChanged={handleSharingChanged} onDelete={() => handleDeleted(d.connection.id)} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Create/edit modal — the form lives here so the page list
          never gets pushed off-screen by a tall form. */}
      <ConnectionFormModal state={form} onClose={() => setForm(null)} onCreated={handleCreated} onUpdated={handleUpdated} />
    </div>
  );
}

function ProviderButton({ icon, name, enabled, onClick }: { icon: React.ReactNode; name: string; enabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!enabled}
      // Dashed border on enabled tiles is the classic "add" affordance
      // (file-system new-doc tile, Trello add-card, etc.) — separates
      // these from the cards below that just list existing
      // connections. On hover the border solidifies + tints accent so
      // there's an obvious "this is clickable" pulse.
      className={cn(
        "group flex h-[76px] flex-col items-start justify-between border-2 p-3 text-left transition",
        enabled
          ? "border-dashed border-border bg-transparent text-foreground hover:border-solid hover:border-accent/60 hover:bg-accent/5"
          : "cursor-not-allowed border-solid border-border/30 bg-transparent text-text-dim/60",
      )}
    >
      <div className="flex items-center gap-2">
        {enabled ? <Plus className="h-4 w-4 text-accent transition group-hover:scale-110" /> : <span className="opacity-60">{icon}</span>}
        <span className="text-sm font-medium">{name}</span>
      </div>
      <span className={cn("font-mono text-[10px] uppercase tracking-[0.14em]", enabled ? "text-text-dim group-hover:text-accent" : "text-text-dim/60")}>
        {enabled ? "Add a bucket" : "Coming soon"}
      </span>
    </button>
  );
}

function ConnectionFormModal({
  state,
  onClose,
  onCreated,
  onUpdated,
}: {
  state: FormState;
  onClose: () => void;
  onCreated: (d: StorageConnectionDetail) => void;
  onUpdated: (d: StorageConnectionDetail) => void;
}) {
  const isEdit = state?.kind === "edit";
  const title = !state ? "" : state.kind === "create" ? "New Cloudflare R2 connection" : `Edit ${state.detail.connection.label}`;
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Reset busy/error each time the modal opens.
  useEffect(() => {
    if (!state) return;
    setError("");
    setBusy(false);
  }, [state]);

  if (!state)
    return (
      <Modal open={false} title="" onClose={onClose}>
        {null}
      </Modal>
    );

  const initial: Connection | undefined = isEdit
    ? {
        provider: state.detail.connection.provider,
        accountId: state.detail.connection.accountId,
        accessKeyId: state.detail.connection.accessKeyId,
        // Empty cleartext on edit — the server's PATCH treats missing
        // secretAccessKey as "leave existing key alone."
        secretAccessKey: "",
        bucket: state.detail.connection.bucket,
        publicBaseUrl: state.detail.connection.publicBaseUrl,
        maxBytes: state.detail.connection.maxBytes,
        label: state.detail.connection.label,
      }
    : undefined;

  const handleConnect = async (conn: Connection) => {
    setError("");
    setBusy(true);
    try {
      if (state.kind === "create") {
        const detail = await api.createStorageConnection({
          label: conn.label?.trim() || `${conn.provider}/${conn.bucket}`,
          provider: conn.provider,
          accountId: conn.accountId,
          bucket: conn.bucket,
          accessKeyId: conn.accessKeyId,
          secretAccessKey: conn.secretAccessKey,
          publicBaseUrl: conn.publicBaseUrl,
          maxBytes: conn.maxBytes,
        });
        onCreated(detail);
      } else {
        const next = await api.updateStorageConnection(state.detail.connection.id, {
          label: conn.label,
          accountId: conn.accountId,
          bucket: conn.bucket,
          accessKeyId: conn.accessKeyId,
          ...(conn.secretAccessKey ? { secretAccessKey: conn.secretAccessKey } : {}),
          publicBaseUrl: conn.publicBaseUrl,
          maxBytes: conn.maxBytes,
        });
        onUpdated(next);
      }
    } catch (err) {
      setError((err as Error).message || "Failed");
      setBusy(false);
    }
  };

  return (
    <Modal open title={title} onClose={onClose} className="max-w-3xl">
      {isEdit && <p className="mb-3 font-mono text-[11px] text-text-dim">Leave the secret key blank to keep the existing one. Fill it in to rotate.</p>}
      <ConnectForm
        initial={initial}
        busy={busy}
        error={error}
        submitLabel={isEdit ? "Save changes" : "Add connection"}
        busyLabel={isEdit ? "Saving…" : "Adding…"}
        onConnect={handleConnect}
        onImportError={setError}
        onCancel={onClose}
      />
    </Modal>
  );
}

function ConnectionCard({
  detail,
  onEdit,
  onChanged,
  onDelete,
}: {
  detail: StorageConnectionDetail;
  onEdit: () => void;
  onChanged: (d: StorageConnectionDetail) => void;
  onDelete: () => Promise<void>;
}) {
  const { connection } = detail;
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);

  const triggerDelete = async () => {
    if (busy) return;
    if (!armed) {
      setArmed(true);
      return;
    }
    setArmed(false);
    setBusy(true);
    try {
      await onDelete();
    } catch {
      setBusy(false);
    }
  };

  return (
    <div className="border border-border bg-bg-elevated/40">
      <header className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Database className="h-4 w-4 shrink-0 text-accent" />
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium text-foreground">{connection.label}</span>
            <span className="font-mono text-[11px] text-text-dim">
              {connection.provider} · {connection.bucket}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onEdit}
            aria-label="Edit"
            title="Edit connection"
            className="flex h-8 w-8 items-center justify-center text-text-dim transition hover:text-foreground"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => void triggerDelete()}
            disabled={busy}
            aria-label={armed ? "Click again to confirm delete" : "Delete"}
            title={armed ? "Click again to confirm" : "Delete connection"}
            className={cn("flex h-8 w-8 items-center justify-center transition", armed ? "animate-pulse-soft bg-accent text-white" : "text-text-dim hover:text-accent")}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>
      <div className="p-4">
        <SharingPanel detail={detail} onChanged={onChanged} />
      </div>
    </div>
  );
}

// Per-connection activations. Tri-state segmented control per owned
// space — Off / Members / + Guests — maps cleanly to (no activation)
// / (openToGuests=false) / (openToGuests=true). Access is purely
// role-based; no per-user grants.
function SharingPanel({ detail, onChanged }: { detail: StorageConnectionDetail; onChanged: (next: StorageConnectionDetail) => void }) {
  const { spaces } = useAuth();
  const ownedSpaces = spaces.filter((s) => s.role === "owner");
  const activationBySpace = new Map(detail.activations.map((a) => [a.spaceId, a]));
  const [busySpace, setBusySpace] = useState<string | null>(null);
  const [error, setError] = useState("");

  const setSpaceState = async (spaceId: string, next: "off" | "members" | "guests") => {
    setBusySpace(spaceId);
    setError("");
    try {
      if (next === "off") {
        await api.deactivateStorageConnection(detail.connection.id, spaceId);
        onChanged({
          ...detail,
          activations: detail.activations.filter((a) => a.spaceId !== spaceId),
        });
      } else {
        const a = await api.activateStorageConnection(detail.connection.id, spaceId, {
          openToGuests: next === "guests",
        });
        onChanged({
          ...detail,
          activations: [...detail.activations.filter((x) => x.spaceId !== spaceId), a],
        });
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusySpace(null);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <header>
        <span className="section-label muted">Activated in</span>
        {/* One-time legend so users learn what Off/Members/+ Guests
            mean. Per-row repetition felt noisy — once at the top is
            enough, and the segmented control labels remind. */}
        {/* Two-column grid so every term aligns in a left rail and every
            definition starts at the same x — the eye gets a clean
            term→def mapping without inline separators doing the
            grouping work. */}
        <dl className="mt-2 grid w-fit grid-cols-[max-content_1fr] gap-x-3 gap-y-1 font-mono text-[10px] text-text-dim">
          <LegendItem term="Off" def="not activated" />
          <LegendItem term="Members" def="signed-in members only" />
          <LegendItem term="+ Guests" def="members + any paired guest" />
        </dl>
      </header>
      {ownedSpaces.length === 0 ? (
        <p className="font-mono text-[11px] text-text-dim">No spaces yet. Create a space to expose this connection.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {ownedSpaces.map((s) => {
            const activation = activationBySpace.get(s.id);
            const value: "off" | "members" | "guests" = !activation ? "off" : activation.openToGuests ? "guests" : "members";
            return (
              <li key={s.id} className="flex flex-wrap items-center gap-3 border border-border bg-bg-elevated/30 px-3 py-2">
                <span className="flex min-w-0 flex-1 items-center gap-2 text-sm text-foreground">
                  <Users2 className="h-3.5 w-3.5 shrink-0 text-text-dim" />
                  <span className="truncate">{s.name}</span>
                </span>
                <TriToggle value={value} busy={busySpace === s.id} onChange={(next) => void setSpaceState(s.id, next)} />
              </li>
            );
          })}
        </ul>
      )}
      {error && <p className="font-mono text-[11px] text-accent">{error}</p>}
    </div>
  );
}

function LegendItem({ term, def }: { term: string; def: string }) {
  return (
    <>
      <dt className="uppercase tracking-[0.14em] text-foreground/80">{term}</dt>
      <dd>· {def}</dd>
    </>
  );
}

function TriToggle({ value, busy, onChange }: { value: "off" | "members" | "guests"; busy: boolean; onChange: (next: "off" | "members" | "guests") => void }) {
  const opts: Array<{ id: "off" | "members" | "guests"; label: string; hint: string }> = [
    { id: "off", label: "Off", hint: "Not activated in this space" },
    { id: "members", label: "Members", hint: "Members only" },
    { id: "guests", label: "+ Guests", hint: "All members + any guest of this space" },
  ];
  const activeIndex = opts.findIndex((o) => o.id === value);

  return (
    <div className="relative inline-grid shrink-0 grid-cols-3 border border-border" role="group" aria-busy={busy}>
      {/* Sliding highlight. Lives behind the buttons and tweens
          between segments via transform — much smoother than flipping
          per-button backgrounds. */}
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-accent shadow-[0_0_18px_hsl(0_100%_65%/0.25)] transition-transform duration-200 ease-out",
          busy && "opacity-80",
        )}
        style={{ transform: `translateX(${activeIndex * 100}%)` }}
      />
      {opts.map((o) => {
        const active = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            disabled={busy || active}
            className={cn(
              "relative z-10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] transition-colors duration-200",
              active ? "text-white" : "text-muted-foreground hover:text-foreground disabled:opacity-50",
            )}
            aria-pressed={active}
            title={o.hint}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// Stub for platform-hosted storage. Renders a single placeholder card
// so we can see how Roomflix-managed buckets will surface next to BYO
// connections — distinct icon (Sparkles), accent gradient + left
// stripe, "managed" tag, no edit/delete affordances. When the hosted
// feature actually ships, replace the hardcoded values with real data
// (likely a `managed: "roomflix"` flag on StorageConnection, or a
// separate `/api/storage/managed` endpoint) and reuse this card.
function ProvidedByRoomflixSection() {
  return (
    <section>
      <header className="mb-3">
        <span className="section-label muted">Provided by Roomflix</span>
        <p className="mt-1 font-mono text-[11px] text-text-dim">Hosted buckets included with your account. No setup required.</p>
      </header>
      <ManagedConnectionCard label="Roomflix Cloud" providerHint="hosted · us-east" quotaHint="5 GB included" />
    </section>
  );
}

function ManagedConnectionCard({ label, providerHint, quotaHint }: { label: string; providerHint: string; quotaHint: string }) {
  return (
    // Dimmed + desaturated to read as "not yet available." The full
    // design stays visible (the point of the stub is to preview it) but
    // grayscale + opacity-60 unmistakably signals inactivity, and the
    // "Coming soon" pill removes any ambiguity. When the feature
    // ships, drop the wrapper classes and swap the pill back to a live
    // "managed" tag.
    <div
      aria-disabled="true"
      title="Not available yet"
      className="relative overflow-hidden border border-accent/30 bg-gradient-to-br from-accent/[0.06] via-bg-elevated/40 to-bg-elevated/40 opacity-60 grayscale select-none"
    >
      <span aria-hidden className="absolute inset-y-0 left-0 w-[2px] bg-accent/70" />
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 pl-5">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Sparkles className="h-4 w-4 shrink-0 text-accent" />
          <div className="flex min-w-0 flex-col">
            <span className="flex items-center gap-2 truncate text-sm font-medium text-foreground">
              {label}
              <span className="border border-foreground/30 bg-foreground/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-foreground/80">Coming soon</span>
            </span>
            <span className="font-mono text-[11px] text-text-dim">
              {providerHint} · {quotaHint}
            </span>
          </div>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-dim">managed</span>
      </div>
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="border border-border bg-bg-elevated/40 p-10 text-center">
      <Database className="mx-auto h-6 w-6 text-text-dim" />
      <p className="mt-3 text-sm text-foreground">No storage connections yet.</p>
      <p className="mt-1 text-xs text-muted-foreground">Pick a provider above to add your first bucket.</p>
      <Button variant="outline" size="sm" className="mt-4" onClick={onAdd}>
        <Plus className="h-3.5 w-3.5" />
        Add Cloudflare R2
      </Button>
    </div>
  );
}

function RestoringFrame() {
  return (
    <div className="flex min-h-[8rem] flex-col items-center justify-center gap-2 border border-border bg-bg-elevated/40 text-center">
      <Loader2 className="h-5 w-5 animate-spin text-accent/90" />
      <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Loading…</span>
    </div>
  );
}
