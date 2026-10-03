import { Link } from "react-router-dom";
import { Clapperboard, Star, Trash2, Tv } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { discoverTitlePath, formatRuntime, posterUrl } from "@/features/discover/discover-utils";
import { formatReleaseDate, type ComparisonTitle } from "./comparison-data";

const voteFormatter = new Intl.NumberFormat();

export function createComparisonColumns(onRemove: (title: ComparisonTitle) => void): ColumnDef<ComparisonTitle>[] {
  return [
    { accessorKey: "title", header: "Title", size: 280, cell: ({ row }) => <TitleCell title={row.original} /> },
    {
      accessorKey: "imdbRating",
      header: "IMDb",
      size: 145,
      sortDescFirst: true,
      cell: ({ row }) => (
        <div>
          <div className="flex items-baseline gap-1">
            <Star className="size-3 self-center fill-amber-300 text-amber-300" aria-hidden="true" />
            <span className="text-base font-medium tabular-nums text-foreground">{row.original.imdbRating.toFixed(1)}</span>
            <span className="text-[9px] text-muted-foreground">/ 10</span>
          </div>
          <span className="block text-[10px] tabular-nums text-muted-foreground">{voteFormatter.format(row.original.imdbVotes)} votes</span>
        </div>
      ),
    },
    { accessorKey: "imdbVotes", header: "IMDb votes", sortDescFirst: true },
    {
      id: "releaseDate",
      accessorFn: (title) => title.releaseDate || undefined,
      header: "Released",
      size: 155,
      sortingFn: "basic",
      sortUndefined: "last",
      sortDescFirst: true,
      cell: ({ row }) => <span className="text-[11px] tabular-nums text-foreground/80">{formatReleaseDate(row.original.releaseDate)}</span>,
    },
    {
      accessorKey: "genres",
      header: "Genres",
      size: 220,
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1">
          {row.original.genres.length ? (
            row.original.genres.map((genre) => (
              <span key={genre} className="rounded-[5px] border border-border-hover bg-background/35 px-1.5 py-0.5 text-[9px] text-foreground/70">
                {genre}
              </span>
            ))
          ) : (
            <span className="text-xs text-muted-foreground">Unknown</span>
          )}
        </div>
      ),
    },
    {
      id: "runtime",
      accessorFn: (title) => title.runtime || undefined,
      header: "Length",
      size: 110,
      sortUndefined: "last",
      sortDescFirst: false,
      cell: ({ row }) => (
        <div>
          <span className="text-[11px] text-foreground/80">{row.original.runtime ? formatRuntime(row.original.runtime) : "Unknown"}</span>
          {row.original.mediaType === "tv" && row.original.runtime ? <span className="mt-1 block text-[9px] text-muted-foreground">per episode</span> : null}
        </div>
      ),
    },
    {
      id: "actions",
      header: "",
      size: 60,
      enableSorting: false,
      cell: ({ row }) => (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-9 rounded-[8px]"
          onClick={() => onRemove(row.original)}
          aria-label={`Remove ${row.original.title}`}
          title={`Remove ${row.original.title}`}
        >
          <Trash2 className="size-4" />
        </Button>
      ),
    },
  ];
}

function TitleCell({ title }: { title: ComparisonTitle }) {
  const poster = posterUrl(title.posterPath, "w92");
  const Icon = title.mediaType === "tv" ? Tv : Clapperboard;
  return (
    <Link to={discoverTitlePath(title)} state={{ hasAppReturn: true }} className="group/title flex items-center min-w-0 gap-2 rounded-[8px]" title={title.title}>
      {poster ? (
        <img
          src={poster}
          alt=""
          width={92}
          height={138}
          loading="lazy"
          decoding="async"
          className="hidden h-10 w-7 shrink-0 rounded-[5px] border border-border object-cover sm:block"
        />
      ) : (
        <span className="hidden h-10 w-7 shrink-0 place-items-center rounded-[5px] border border-border bg-muted sm:grid">
          <Icon className="size-4 text-muted-foreground" />
        </span>
      )}
      <span className="min-w-0">
        <span className="line-clamp-1 text-xs font-medium leading-4 text-foreground transition-colors group-hover/title:text-accent">{title.title}</span>
        <span className="mt-0.5 flex items-center gap-1.5 text-[9px] text-muted-foreground">
          <Icon className="size-3" />
          {title.mediaType === "tv" ? "Series" : "Movie"}
          <span className="text-text-dim">·</span>
          {title.releaseDate.slice(0, 4) || "Year unknown"}
        </span>
      </span>
    </Link>
  );
}
