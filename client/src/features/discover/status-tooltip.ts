import type { TitleLibraryItem } from "@shared/protocol";

const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

export function statusTooltip(action: string, timestamp?: number | null): string {
  return `${action} · ${statusDateLabel(timestamp)}`;
}

export function statusDateLabel(timestamp?: number | null): string {
  const date = timestamp && Number.isFinite(timestamp) && timestamp > 0 ? new Date(timestamp) : null;
  return date && Number.isFinite(date.getTime()) ? dateFormatter.format(date) : "Date unavailable";
}

export function titleLibraryStatusDate(item?: Pick<TitleLibraryItem, "status" | "watchlistedAt" | "watchedAt">): number | null {
  return (item?.status === "shortlist" ? item.watchlistedAt : item?.watchedAt) ?? null;
}
