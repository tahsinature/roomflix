import { useEffect, useRef, useState } from "react";
import { ChevronDown, Pause, Play, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { MemberDetailModal, type MemberDetailKey } from "@/components/MemberDetailModal";
import { SpaceMembersPopover } from "@/components/SpaceMembersPopover";
import { useAuth } from "@/auth/AuthContext";
import { useSessionPresence } from "@/auth/SessionPresence";
import { cn } from "@/lib/utils";

// Split control for theater access and the active space's member directory.
// The main presence area keeps the original one-click route to /watch; the
// chevron expands the complete directory, including offline members.
export function SpaceMembersMenu({ meId, className, align = "left" }: { meId?: string | null; className?: string; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const [selectedDetail, setSelectedDetail] = useState<MemberDetailKey | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const { currentSpace, isGuest } = useAuth();
  const { state, participants, members } = useSessionPresence();

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      const root = rootRef.current;
      if (root && event.target instanceof Node && !root.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const memberIds = new Set(members.map((member) => member.userId));
  const connectedGuestCount = participants.reduce((count, participant) => count + (participant.kind === "guest" || !memberIds.has(participant.id) ? 1 : 0), 0);
  const totalPeople = members.length + connectedGuestCount;
  const onlineCount = participants.length;
  const watchingCount = participants.reduce((count, participant) => count + (participant.status === "watching" ? 1 : 0), 0);
  const hasActiveTheater = Boolean(state?.videoUrl && watchingCount > 0);
  const theaterActivity = hasActiveTheater ? (state?.playing ? ", theater playing" : ", theater paused") : "";

  return (
    <>
      <div ref={rootRef} className={cn("relative inline-flex", className)}>
        <div
          className={cn(
            "inline-flex h-9 items-center border font-mono text-xs transition",
            hasActiveTheater ? "border-accent/40 bg-accent/10 text-foreground" : "border-border bg-bg-elevated/50 text-foreground",
          )}
        >
          <Link
            to="/watch"
            onClick={() => setOpen(false)}
            aria-label={`Open theater. ${onlineCount} online${theaterActivity}`}
            title="Open the theater"
            className="flex h-full items-center gap-1.5 px-3 transition hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-accent/60"
          >
            <Users className={cn("h-3 w-3", onlineCount > 0 ? "text-accent" : "text-text-dim/70")} />
            <span className="tabular-nums">{onlineCount}</span>
            <span className="hidden text-text-dim lg:inline">online</span>
            {hasActiveTheater ? (
              state?.playing ? (
                <Play className="h-2.5 w-2.5 fill-current text-accent" aria-hidden />
              ) : (
                <Pause className="h-2.5 w-2.5 fill-current text-accent" aria-hidden />
              )
            ) : null}
          </Link>
          <button
            type="button"
            onClick={() => setOpen((current) => !current)}
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-label={`View space members: ${onlineCount} online, ${totalPeople} total`}
            title={`View all ${totalPeople} members of ${currentSpace?.name ?? "this space"}`}
            className="flex h-full items-center border-l border-white/10 px-2 transition hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-accent/60"
          >
            <ChevronDown className={cn("h-3 w-3 text-text-dim transition", open && "rotate-180")} />
          </button>
        </div>

        {open ? (
          <SpaceMembersPopover
            align={align}
            spaceName={currentSpace?.name ?? "Current space"}
            canManage={!isGuest}
            members={members}
            participants={participants}
            state={state}
            meId={meId ?? null}
            onClose={() => setOpen(false)}
            onSelectMember={(detail) => {
              setOpen(false);
              setSelectedDetail(detail);
            }}
          />
        ) : null}
      </div>
      <MemberDetailModal detail={selectedDetail} onClose={() => setSelectedDetail(null)} />
    </>
  );
}
