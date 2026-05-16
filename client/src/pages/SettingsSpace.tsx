import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowRightLeft, CheckCircle2, Plus } from "lucide-react";
import type { Space, SpaceSummary } from "@shared/protocol";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/auth/AuthContext";
import { CreateSpaceCard, RedeemInline, SpaceDetailCard } from "@/pages/Spaces";
import { cn } from "@/lib/utils";

// Space settings — the central hub for managing every space the user
// belongs to. Two separate ideas live here:
//
//   1. *Selected* space → which space's config the detail card shows.
//      Switched by clicking a pill in the strip.
//   2. *Active* space → the global context that drives Library /
//      Storage / playback. Changed only by the explicit
//      "Switch to this space" button so it never happens by accident.
//
// Pills are highlighted by selection; the active space gets a small
// ACTIVE tag so the user always knows where they stand.
//
// The `?new=1` search param is preserved across reloads so the
// create-space flow is linkable / refresh-safe.
export default function SettingsSpace() {
  const { spaces, refresh, currentSpace, switchSpace } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [creating, setCreating] = useState(searchParams.get("new") === "1");
  const [selectedId, setSelectedId] = useState<string | null>(
    currentSpace?.id ?? spaces[0]?.id ?? null,
  );
  // Transient "Switched to <name>" confirmation. Set right after a
  // successful switch, cleared 2.4s later so the banner returns to
  // its no-banner resting state.
  const [justSwitchedTo, setJustSwitchedTo] = useState<string | null>(null);

  // Keep selection in sync if memberships shift under us (joined via
  // redeem, deleted the selected one, etc.).
  useEffect(() => {
    if (selectedId && spaces.some((s) => s.id === selectedId)) return;
    setSelectedId(currentSpace?.id ?? spaces[0]?.id ?? null);
  }, [spaces, currentSpace?.id, selectedId]);

  useEffect(() => {
    if (!justSwitchedTo) return;
    const t = setTimeout(() => setJustSwitchedTo(null), 2400);
    return () => clearTimeout(t);
  }, [justSwitchedTo]);

  const setNewParam = (on: boolean) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (on) next.set("new", "1");
        else next.delete("new");
        return next;
      },
      { replace: true },
    );
  };

  const onCreated = async (space: Space) => {
    setCreating(false);
    setNewParam(false);
    await refresh();
    await switchSpace(space.id);
    setSelectedId(space.id);
  };

  const handleSwitchToSelected = async () => {
    if (!selectedId || selectedId === currentSpace?.id) return;
    const target = spaces.find((s) => s.id === selectedId);
    await switchSpace(selectedId);
    setJustSwitchedTo(target?.name ?? "space");
  };

  return (
    <div className="flex flex-col gap-5">
      <SpaceStrip
        spaces={spaces}
        currentId={currentSpace?.id ?? null}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onNewSpace={() => {
          setCreating(true);
          setNewParam(true);
        }}
        onRedeemed={refresh}
      />

      {/* Switch banner. Three states wired through one slot so the
          layout doesn't jump as state changes:
            1. just switched → "Switched to X ✓" (2.4s)
            2. selected ≠ active → "Switch to this space" CTA
            3. otherwise → nothing (banner unmounted) */}
      {justSwitchedTo ? (
        <SwitchedBanner name={justSwitchedTo} />
      ) : selectedId && selectedId !== currentSpace?.id ? (
        <SwitchPrompt
          targetName={spaces.find((s) => s.id === selectedId)?.name ?? "this space"}
          onSwitch={handleSwitchToSelected}
        />
      ) : null}

      <div>
        {creating ? (
          <CreateSpaceCard
            onCancel={() => {
              setCreating(false);
              setNewParam(false);
            }}
            onCreated={onCreated}
          />
        ) : selectedId ? (
          <SpaceDetailCard
            key={selectedId}
            spaceId={selectedId}
            onChanged={refresh}
            onDeleted={async () => {
              await refresh();
              setSelectedId(null);
            }}
          />
        ) : (
          <div className="border border-border bg-bg-elevated/40 p-10 text-center text-sm text-muted-foreground">
            Pick a space, or create a new one.
          </div>
        )}
      </div>
    </div>
  );
}

function SwitchPrompt({ targetName, onSwitch }: { targetName: string; onSwitch: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border border-accent/40 bg-accent/10 px-4 py-3">
      <div className="flex items-center gap-2">
        <ArrowRightLeft className="h-4 w-4 text-accent" />
        <span className="text-sm text-foreground">
          You're viewing <span className="font-medium">{targetName}</span> — not your active space.
        </span>
      </div>
      <Button variant="accent" size="sm" onClick={onSwitch}>
        Switch to this space
      </Button>
    </div>
  );
}

function SwitchedBanner({ name }: { name: string }) {
  return (
    <div className="flex items-center gap-2 border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-foreground">
      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
      Switched to <span className="font-medium">{name}</span>.
    </div>
  );
}

// Horizontal picker. Pills wrap so on narrow content the spaces flow
// onto a second line — never a sideways scroller (we'd lose the
// "+ New space" / invite-code controls behind overflow).
function SpaceStrip({
  spaces,
  currentId,
  selectedId,
  onSelect,
  onNewSpace,
  onRedeemed,
}: {
  spaces: SpaceSummary[];
  currentId: string | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNewSpace: () => void;
  onRedeemed: () => Promise<void>;
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3 sm:gap-y-2">
      <ul className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
        {spaces.length === 0 ? (
          <li className="font-mono text-[11px] text-text-dim">No spaces yet.</li>
        ) : (
          spaces.map((s) => (
            <li key={s.id}>
              <SpacePill
                space={s}
                selected={s.id === selectedId}
                active={s.id === currentId}
                onClick={() => onSelect(s.id)}
              />
            </li>
          ))
        )}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={onNewSpace}>
          <Plus className="h-3.5 w-3.5" />
          New space
        </Button>
        <RedeemInline onRedeemed={onRedeemed} />
      </div>
    </div>
  );
}

function SpacePill({
  space,
  selected,
  active,
  onClick,
}: {
  space: SpaceSummary;
  selected: boolean;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={selected ? "page" : undefined}
      title={active ? "Your active space" : `View ${space.name}'s settings`}
      className={cn(
        "flex items-center gap-1.5 border px-2.5 py-1.5 transition",
        selected
          ? "border-accent/50 bg-accent/10 text-foreground"
          : "border-border bg-bg-elevated/40 text-muted-foreground hover:border-border-hover hover:bg-bg-elevated/70 hover:text-foreground",
      )}
    >
      <span className="text-sm">{space.name}</span>
      <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-text-dim">
        {space.role}
      </span>
      {active && (
        <span className="border border-accent/40 bg-accent/15 px-1 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-accent">
          active
        </span>
      )}
    </button>
  );
}
