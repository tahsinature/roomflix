import { Tooltip } from "@/components/ui/tooltip";
import { useEffect, useRef, useState } from "react";
import { Columns3 } from "lucide-react";
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { COMPARISON_COLUMN_IDS, type ComparisonColumnId, type UserPreferencesPatch } from "@shared/protocol";
import { useAuth } from "@/auth/AuthContext";
import { useToast } from "@/components/Toast";
import { SortableComparisonColumn } from "./SortableComparisonColumn";

export function ComparisonColumnsMenu({ visible, order }: { visible: ComparisonColumnId[]; order: ComparisonColumnId[] }) {
  const { updatePreferences } = useAuth();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [dragging, setDragging] = useState(false);
  const menuRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const closeOnOutsideClick = (event: PointerEvent) => {
      const menu = menuRef.current;
      if (menu?.open && event.target instanceof Node && !menu.contains(event.target)) menu.open = false;
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, []);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates, keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space"] } }),
  );
  const save = async (preferences: NonNullable<UserPreferencesPatch["discover"]>) => {
    setSaving(true);
    try {
      await updatePreferences({ discover: preferences });
    } catch {
      toast.error("Could not save your column settings. Please try again.");
    } finally {
      setSaving(false);
    }
  };
  const reorder = ({ active, over }: DragEndEvent) => {
    setDragging(false);
    if (saving || !over || active.id === over.id) return;
    const from = order.indexOf(active.id as ComparisonColumnId);
    const to = order.indexOf(over.id as ComparisonColumnId);
    if (from !== -1 && to !== -1) void save({ compareColumnOrder: arrayMove(order, from, to) });
  };

  return (
    <details
      ref={menuRef}
      className="relative col-start-3 row-start-1 sm:order-3"
      onBlur={(event) => {
        if (!saving && !dragging && event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false;
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !dragging) {
          event.preventDefault();
          event.currentTarget.open = false;
          event.currentTarget.querySelector("summary")?.focus();
        }
      }}
    >
      <Tooltip content="Columns">
        <summary
          aria-label="Configure comparison columns"
          className="flex h-7 cursor-pointer list-none items-center justify-center gap-1.5 rounded-[6px] border border-border-hover bg-card px-1.5 text-[10px] text-muted-foreground hover:text-foreground focus-visible:outline-accent sm:h-8 sm:px-2 [&::-webkit-details-marker]:hidden"
        >
          <Columns3 className="size-3.5" aria-hidden="true" />
          <span className="hidden sm:inline">Columns</span>
        </summary>
      </Tooltip>
      <div className="absolute right-0 top-full z-30 mt-2 w-56 rounded-lg border border-border-hover bg-bg-elevated p-3 shadow-xl">
        <p className="mb-2 text-[9px] uppercase tracking-wider text-muted-foreground">Show columns</p>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          accessibility={{
            screenReaderInstructions: {
              draggable: "Press Enter to show or hide a column. Press Space to start reordering, use arrow keys to move, and press Space to drop or Escape to cancel.",
            },
          }}
          onDragStart={() => setDragging(true)}
          onDragCancel={() => setDragging(false)}
          onDragEnd={reorder}
        >
          <SortableContext items={order} strategy={verticalListSortingStrategy}>
            {order.map((id) => (
              <SortableComparisonColumn
                key={id}
                id={id}
                visible={visible.includes(id)}
                disabled={saving}
                onToggle={(checked) => void save({ compareColumns: checked ? [...visible, id] : visible.filter((column) => column !== id) })}
              />
            ))}
          </SortableContext>
        </DndContext>
        <p className="mt-2 text-[9px] text-muted-foreground">Click to toggle · Drag to reorder.</p>
        <p className="mt-1 text-[9px] text-muted-foreground">Title and row controls always stay visible.</p>
        <button
          type="button"
          disabled={saving}
          onClick={() => void save({ compareColumns: [...COMPARISON_COLUMN_IDS], compareColumnOrder: [...COMPARISON_COLUMN_IDS] })}
          className="mt-3 w-full border-t border-border pt-2 text-left text-[10px] text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          Reset to default
        </button>
      </div>
    </details>
  );
}
