import { Tooltip } from "@/components/ui/tooltip";
import { Check, GripVertical } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ComparisonColumnId } from "@shared/protocol";
import { cn } from "@/lib/utils";

const labels: Record<ComparisonColumnId, string> = {
  imdbRating: "IMDb rating & count",
  tmdbRating: "TMDB rating & count",
  releaseDate: "Released",
  genres: "Genres",
  runtime: "Length",
};

export function SortableComparisonColumn({
  id,
  visible,
  disabled,
  onToggle,
}: {
  id: ComparisonColumnId;
  visible: boolean;
  disabled: boolean;
  onToggle: (visible: boolean) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled });

  return (
    <Tooltip content="Click to show or hide · Drag to reorder">
      <button
        ref={setNodeRef}
        type="button"
        {...attributes}
        {...listeners}
        role="checkbox"
        aria-checked={visible}
        aria-pressed={undefined}
        aria-label={labels[id]}
        aria-disabled={disabled}
        onClick={() => !disabled && onToggle(!visible)}
        style={{ transform: CSS.Transform.toString(transform ? { ...transform, x: 0 } : null), transition }}
        className={cn(
          "relative flex w-full touch-none select-none items-center gap-2 rounded bg-bg-elevated px-1.5 py-2 text-left text-xs transition-colors hover:bg-accent/10 focus-visible:bg-accent/10 focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent aria-disabled:cursor-wait aria-disabled:opacity-50 cursor-grab active:cursor-grabbing",
          isDragging && "z-10 bg-accent/10 shadow-lg ring-1 ring-border-hover",
        )}
      >
        <GripVertical className="size-3.5 shrink-0 text-muted-foreground/60" aria-hidden="true" />
        <span
          aria-hidden="true"
          className={cn("grid size-3.5 shrink-0 place-items-center rounded-[4px] border", visible ? "border-accent bg-accent text-white" : "border-muted-foreground/60 bg-muted")}
        >
          {visible ? <Check className="size-2.5" strokeWidth={3} /> : null}
        </span>
        <span className="min-w-0 flex-1">{labels[id]}</span>
      </button>
    </Tooltip>
  );
}
