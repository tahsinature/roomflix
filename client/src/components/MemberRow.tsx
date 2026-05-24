import { Crown, User } from "lucide-react";
import { cn } from "@/lib/utils";

// One row shape, used by every list of people in the app — the space
// members popover (navbar) and the theater's "watching" popover. Same
// avatar, same name treatment, same "you" tag, so the surfaces feel
// like variations on a theme rather than separate widgets.
//
// Tone:
//   member — accent-bordered avatar (default).
//   guest  — amber-bordered avatar, italic name. Visually distinguishes
//            ephemeral pairings from durable accounts.
//
// Slots:
//   subtitle  — small mono caption under the name (role, "Guest", etc.).
//   rightSlot — anything to anchor on the right (status pill, action).
//
// When `onClick` is set the row renders as a button (the navbar popover
// uses it to open the member detail modal). Without it, the row is a
// static row — used by the theater watchers list where the rows don't
// carry their own action.
export function MemberRow({
  name,
  subtitle,
  isOwner = false,
  isMe = false,
  tone = "member",
  rightSlot,
  onClick,
  title,
}: {
  name: string;
  subtitle?: string;
  isOwner?: boolean;
  isMe?: boolean;
  tone?: "member" | "guest";
  rightSlot?: React.ReactNode;
  onClick?: () => void;
  title?: string;
}) {
  const body = (
    <>
      <span
        className={cn(
          "inline-flex h-7 w-7 shrink-0 items-center justify-center border",
          tone === "guest" ? "border-amber-300/30 bg-amber-300/10 text-amber-200" : "border-accent/30 bg-accent/10 text-accent",
        )}
      >
        {isOwner ? <Crown className="h-3.5 w-3.5" /> : <User className="h-3.5 w-3.5" />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={cn("truncate text-sm text-foreground", tone === "guest" && "italic")}>{name}</span>
          {isMe && <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-dim">you</span>}
        </div>
        {subtitle && <div className="font-mono text-[11px] text-text-dim">{subtitle}</div>}
      </div>
      {rightSlot}
    </>
  );

  if (onClick) {
    return (
      <li>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onClick}
          className="flex w-full items-center gap-3 px-3 py-2 text-left transition hover:bg-white/[0.04]"
          title={title}
        >
          {body}
        </button>
      </li>
    );
  }
  return (
    <li className="flex w-full items-center gap-3 px-3 py-2" title={title}>
      {body}
    </li>
  );
}
