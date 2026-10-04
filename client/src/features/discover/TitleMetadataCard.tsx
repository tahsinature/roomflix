import { Tooltip } from "@/components/ui/tooltip";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function TitleMetadataCard({
  label,
  icon: Icon,
  value,
  caption,
  tone = "text-muted-foreground",
  title,
}: {
  label: string;
  icon: LucideIcon;
  value: ReactNode;
  caption: string;
  tone?: string;
  title?: ReactNode;
}) {
  return (
    <Tooltip content={title}>
      <div className="min-w-0 rounded-lg border border-white/10 bg-black/25 px-2.5 py-2.5 backdrop-blur-sm">
        <div className={cn("flex items-center gap-1.5 text-[8px] uppercase tracking-[0.1em]", tone)}>
          <Icon className="size-3 shrink-0" aria-hidden="true" /> {label}
        </div>
        <div className="mt-1.5 text-sm font-semibold leading-5 tabular-nums text-foreground sm:text-base">{value}</div>
        <p className="mt-1 text-[9px] leading-3.5 tabular-nums text-muted-foreground">{caption}</p>
      </div>
    </Tooltip>
  );
}
