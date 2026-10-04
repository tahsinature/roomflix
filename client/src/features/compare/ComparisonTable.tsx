import { COMPARISON_COLUMN_IDS } from "@shared/protocol";
import { useAuth } from "@/auth/AuthContext";
import { ComparisonColumnsMenu } from "./ComparisonColumnsMenu";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, GitCompareArrows, Plus } from "lucide-react";
import { flexRender, getCoreRowModel, getSortedRowModel, useReactTable, type SortingState } from "@tanstack/react-table";
import { closestCenter, DndContext, KeyboardSensor, MouseSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { SortableComparisonRow } from "./SortableComparisonRow";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ComparisonTitle } from "./comparison-data";
import { createComparisonColumns } from "./comparison-columns";

export function ComparisonTable({
  titles,
  onRemove,
  onAdd,
  onMove,
}: {
  titles: ComparisonTitle[];
  onRemove: (title: ComparisonTitle) => void;
  onAdd: () => void;
  onMove: (activeId: string, overId: string) => void;
}) {
  const { user } = useAuth();
  const visibleColumns = user?.preferences.discover.compareColumns ?? [...COMPARISON_COLUMN_IDS];
  const columnOrder = user?.preferences.discover.compareColumnOrder ?? [...COMPARISON_COLUMN_IDS];
  const columnVisibility = Object.fromEntries(COMPARISON_COLUMN_IDS.map((id) => [id, visibleColumns.includes(id)]));
  const [sorting, setSorting] = useState<SortingState>([]);
  const sensors = useSensors(
    useSensor(MouseSensor),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const priorityMode = sorting.length === 0;
  const sortValue = priorityMode ? "priority" : `${sorting[0].id}:${sorting[0].desc ? "desc" : "asc"}`;
  const columns = useMemo(() => createComparisonColumns(onRemove), [onRemove]);

  const table = useReactTable({
    data: titles,
    columns,
    state: { sorting, columnVisibility: { ...columnVisibility, imdbVotes: false }, columnOrder: ["title", ...columnOrder, "imdbVotes", "actions"] },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (title) => title.id,
    enableMultiSort: false,
  });

  const nonTitleWidth = table
    .getVisibleLeafColumns()
    .filter((column) => column.id !== "title")
    .reduce((width, column) => width + column.getSize(), 0);
  const rows = table.getRowModel().rows;
  const rowIds = rows.map((row) => row.id);
  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (priorityMode && over) onMove(String(active.id), String(over.id));
  };

  return (
    <>
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-x-1.5 gap-y-1 px-3 py-2 sm:flex sm:flex-wrap sm:gap-3 sm:px-5 sm:py-3">
        <h1 className="col-start-1 row-start-1 flex items-center gap-1.5 text-xs font-medium sm:order-1 sm:gap-2 sm:text-sm sm:mr-auto">
          <GitCompareArrows className="size-3 text-accent sm:size-4" /> Compare <span className="text-[10px] tabular-nums text-muted-foreground">{titles.length}</span>
        </h1>
        <label className="col-start-2 row-start-1 flex min-w-0 items-center gap-2 text-[10px] text-muted-foreground sm:order-3">
          <span className="sr-only">Sort comparison</span>
          <select
            className="h-7 w-full min-w-0 rounded-[6px] border border-border-hover bg-card px-1.5 text-[9px] text-foreground focus-visible:outline-accent sm:h-8 sm:w-auto sm:max-w-[13rem] sm:px-2 sm:text-[10px]"
            value={sortValue}
            onChange={(event) => {
              const [id, direction] = event.target.value.split(":");
              setSorting(id === "priority" ? [] : [{ id, desc: direction === "desc" }]);
            }}
          >
            <option value="priority">My priority</option>
            <option value="imdbRating:desc">IMDb rating: highest first</option>
            <option value="imdbRating:asc">IMDb rating: lowest first</option>
            <option value="tmdbRating:desc">TMDB rating: highest first</option>
            <option value="tmdbRating:asc">TMDB rating: lowest first</option>
            <option value="imdbVotes:desc">IMDb votes: most first</option>
            <option value="imdbVotes:asc">IMDb votes: fewest first</option>
            <option value="releaseDate:desc">Release: newest first</option>
            <option value="releaseDate:asc">Release: oldest first</option>
            <option value="title:asc">Title: A–Z</option>
            <option value="title:desc">Title: Z–A</option>
            <option value="runtime:asc">Length: shortest first</option>
            <option value="runtime:desc">Length: longest first</option>
          </select>
        </label>
        <ComparisonColumnsMenu visible={visibleColumns} order={columnOrder} />
        <Button
          type="button"
          variant="accent"
          size="sm"
          className="col-start-4 row-start-1 h-7 w-7 rounded-[6px] p-0 text-[10px] sm:order-4 sm:h-8 sm:w-auto sm:px-3"
          onClick={onAdd}
          aria-label="Add title"
        >
          <Plus className="size-3.5" />
          <span className="hidden sm:inline">Add title</span>
        </Button>
        <p className="col-span-4 row-start-2 text-[9px] leading-4 text-muted-foreground sm:order-5 sm:w-full sm:text-[10px]">
          <span className="sm:hidden">Drag in My priority · Order saved.</span>
          <span className="hidden sm:inline">Use My priority to drag rows. Your saved order is preserved when sorting.</span>
        </p>
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <div
          className="overflow-x-auto [scrollbar-width:thin] [--compare-title-width:8rem] sm:[--compare-title-width:18rem]"
          role="region"
          aria-label="Title comparison table"
          tabIndex={0}
        >
          <table className="w-full table-fixed border-collapse text-left" style={{ minWidth: `calc(var(--compare-title-width) + ${nonTitleWidth}px)` }}>
            <caption className="sr-only">
              Compare movies and series. IMDb ratings and vote counts are supplied by OMDb. Select a column header to sort. In My priority, use a row handle to drag, or press
              Space, arrow keys, then Space to reorder.
            </caption>
            <thead>
              {table.getHeaderGroups().map((group) => (
                <tr key={group.id} className="border-y border-border bg-background/35">
                  {group.headers.map((header) => {
                    const sorted = header.column.getIsSorted();
                    const SortIcon = sorted === "asc" ? ArrowUp : sorted === "desc" ? ArrowDown : ArrowUpDown;
                    return (
                      <th
                        key={header.id}
                        scope="col"
                        style={{ width: header.column.id === "title" ? "var(--compare-title-width)" : header.getSize() }}
                        aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : header.column.getCanSort() ? "none" : undefined}
                        className={cn(
                          "px-5 py-3 text-[9px] font-medium uppercase tracking-[0.13em] text-muted-foreground",
                          header.column.id === "title" && "sticky left-0 z-10 bg-bg-elevated",
                          header.column.id === "actions" && "sticky right-0 z-10 bg-bg-elevated px-2",
                        )}
                      >
                        {header.column.getCanSort() ? (
                          <button
                            type="button"
                            onClick={header.column.getToggleSortingHandler()}
                            className={cn("flex items-center gap-2 transition-colors hover:text-foreground", sorted && "text-foreground")}
                            aria-label={`Sort by ${header.column.columnDef.header as string}`}
                          >
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            <SortIcon className={cn("size-3", !sorted && "opacity-40")} aria-hidden="true" />
                          </button>
                        ) : header.column.id === "actions" ? (
                          <span className="sr-only">Actions</span>
                        ) : (
                          flexRender(header.column.columnDef.header, header.getContext())
                        )}
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            {titles.length ? (
              <SortableContext items={rowIds} strategy={verticalListSortingStrategy}>
                <tbody>
                  {rows.map((row) => (
                    <SortableComparisonRow key={row.id} row={row} disabled={!priorityMode} />
                  ))}
                </tbody>
              </SortableContext>
            ) : null}
          </table>
        </div>
      </DndContext>
      {!titles.length ? (
        <div className="flex min-h-72 flex-col items-center justify-center gap-4 px-6 py-12 text-center">
          <div className="grid size-14 place-items-center rounded-[16px] border border-accent/15 bg-accent/[0.04] text-accent">
            <GitCompareArrows className="size-6" strokeWidth={1.5} />
          </div>
          <div>
            <h2 className="text-base font-medium tracking-tight">Add your first contender.</h2>
            <p className="mx-auto mt-2 max-w-sm text-xs leading-6 text-muted-foreground">
              A movie, a series, that title you keep putting off.
              <br />
              Add a few and see how they compare.
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" className="rounded-[8px]" onClick={onAdd}>
            <Plus className="size-3.5" /> Add a title
          </Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={onAdd}
          className="flex w-full items-center gap-3 px-6 py-3 text-xs text-muted-foreground transition-colors hover:bg-accent/[0.025] hover:text-accent"
        >
          <span className="grid size-7 place-items-center rounded-[5px] border border-dashed border-border-hover">
            <Plus className="size-3.5" />
          </span>
          Add another movie or series
        </button>
      )}
    </>
  );
}
