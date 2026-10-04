import type { DiscoverSeriesStatus } from "@shared/protocol";

const statuses = {
  "Returning Series": {
    label: "Returning",
    icon: "returning",
    color: "text-cyan",
    description: "Listed as returning on TMDB. This does not confirm renewal for a particular season.",
  },
  Ended: { label: "Ended", icon: "ended", color: "text-live", description: "The series has finished its run. A future revival is still possible." },
  Canceled: { label: "Cancelled", icon: "cancelled", color: "text-accent", description: "The series was cancelled; its story may be unresolved." },
  "In Production": { label: "In production", icon: "upcoming", color: "text-amber-300", description: "Listed as in production on TMDB." },
  Planned: { label: "Planned", icon: "upcoming", color: "text-amber-300", description: "The series is planned; a release may not be scheduled yet." },
  Pilot: { label: "Pilot", icon: "upcoming", color: "text-amber-300", description: "A pilot is listed; a full series may not be ordered." },
} as const;

export function seriesStatusPresentation({ status, nextEpisode }: DiscoverSeriesStatus, today = new Date().toISOString().slice(0, 10)) {
  const presentation = (Object.hasOwn(statuses, status) ? statuses[status as keyof typeof statuses] : null) ?? {
    label: "Status unknown",
    icon: "unknown" as const,
    color: "text-muted-foreground",
    description: "Series status is unavailable or unrecognised.",
  };
  const active = status === "Returning Series" || status === "In Production" || status === "Planned";
  const airDate = nextEpisode?.airDate ?? "";
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(airDate) && Number.isFinite(Date.parse(airDate)) && new Date(airDate).toISOString().slice(0, 10) === airDate;
  const next = active && nextEpisode && validDate && airDate >= today ? nextEpisode : null;
  const nextLabel = next
    ? `Next: ${new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(next.airDate))}`
    : null;
  const tooltip = [
    presentation.label,
    presentation.description,
    next ? `S${next.seasonNumber} E${next.episodeNumber} · ${nextLabel}` : active ? "Next episode date unknown." : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return { ...presentation, nextLabel, tooltip, active };
}

export function seriesCountSummary(data: Pick<DiscoverSeriesStatus, "numberOfSeasons" | "numberOfEpisodes">): string | null {
  const counts = [
    [data.numberOfSeasons, "season"],
    [data.numberOfEpisodes, "episode"],
  ] as const;
  const labels = counts.flatMap(([count, label]) =>
    typeof count === "number" && Number.isSafeInteger(count) && count >= 0 ? [`${count.toLocaleString()} ${label}${count === 1 ? "" : "s"}`] : [],
  );
  return labels.length ? labels.join(" · ") : null;
}
