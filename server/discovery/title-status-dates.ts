import type { TitleLibraryItem, TitleLibraryStatus } from "@/protocol.ts";

export function titleStatusDates(existing: Pick<TitleLibraryItem, "status" | "watchlistedAt" | "watchedAt"> | null, status: TitleLibraryStatus, now: number) {
  return {
    watchlistedAt: status === "shortlist" && existing?.status !== "shortlist" ? now : (existing?.watchlistedAt ?? null),
    watchedAt: status === "watched" && existing?.status !== "watched" ? now : (existing?.watchedAt ?? null),
  };
}
