import { Tooltip } from "@/components/ui/tooltip";
import { TitleCardContextMenu } from "@/features/discover/TitleCardContextMenu";
import { GripVertical } from "lucide-react";
import { flexRender, type Row } from "@tanstack/react-table";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import type { ComparisonTitle } from "./comparison-data";

export function SortableComparisonRow({ row, disabled }: { row: Row<ComparisonTitle>; disabled: boolean }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: row.id, disabled });

  const title = row.original;
  const menuTitle = { ...title, year: title.releaseDate.slice(0, 4), overview: "", backdropPath: null, voteAverage: 0, voteCount: 0, adult: false };
  return (
    <TitleCardContextMenu title={menuTitle} knownImdbId={title.imdbId}>
      <tr
        ref={setNodeRef}
        style={{ transform: CSS.Transform.toString(transform ? { ...transform, x: 0 } : null), transition, position: "relative", zIndex: isDragging ? 20 : undefined }}
        className={cn("group border-b border-border bg-card transition-colors hover:bg-bg-elevated", isDragging && "shadow-lg opacity-80")}
      >
        {row.getVisibleCells().map((cell) => (
          <td
            key={cell.id}
            className={cn(
              "px-5 py-2.5 align-middle",
              cell.column.id === "title" && "sticky left-0 z-10 bg-card pl-2 shadow-[8px_0_14px_-12px_rgba(0,0,0,0.8)]",
              cell.column.id === "actions" && "sticky right-0 z-10 bg-card px-2",
            )}
          >
            {cell.column.id === "title" ? (
              <div className="flex items-center gap-1.5">
                <Tooltip content={disabled ? "Select My priority to reorder" : "Drag to prioritize"}>
                  <span className="shrink-0">
                    <button
                      ref={setActivatorNodeRef}
                      type="button"
                      {...attributes}
                      {...listeners}
                      disabled={disabled}
                      aria-label={`Move ${row.original.title}`}
                      className="grid h-8 w-6 touch-none place-items-center rounded-[4px] text-muted-foreground/60 hover:bg-muted hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-25 enabled:cursor-grab enabled:active:cursor-grabbing"
                    >
                      <GripVertical className="size-3.5" aria-hidden="true" />
                    </button>
                  </span>
                </Tooltip>
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </div>
            ) : (
              flexRender(cell.column.columnDef.cell, cell.getContext())
            )}
          </td>
        ))}
      </tr>
    </TitleCardContextMenu>
  );
}
