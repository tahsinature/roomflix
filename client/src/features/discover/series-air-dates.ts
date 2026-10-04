import type { DiscoverSeriesStatus } from "@shared/protocol";

export function isCalendarDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}

export function seriesAirDates(data: Pick<DiscoverSeriesStatus, "status" | "firstAirDate" | "lastAirDate">, today = new Date().toISOString().slice(0, 10)) {
  const first = isCalendarDate(data.firstAirDate) ? data.firstAirDate : null;
  const last = isCalendarDate(data.lastAirDate) ? data.lastAirDate : null;
  const final = data.status === "Ended" && last && last <= today && (!first || last >= first) ? last : null;
  return { first, final };
}
