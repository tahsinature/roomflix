import { expect, test } from "bun:test";
import { titleStatusDates } from "../server/discovery/title-status-dates";

test("records when a title enters each status", () => {
  expect(titleStatusDates(null, "shortlist", 100)).toEqual({ watchlistedAt: 100, watchedAt: null });
  const watched = titleStatusDates({ status: "shortlist", watchlistedAt: 100, watchedAt: null }, "watched", 200);
  expect(watched).toEqual({ watchlistedAt: 100, watchedAt: 200 });
  expect(titleStatusDates({ status: "watched", ...watched }, "shortlist", 300)).toEqual({ watchlistedAt: 300, watchedAt: 200 });
});

test("notes and rating edits do not reset status dates", () => {
  expect(titleStatusDates({ status: "watched", watchlistedAt: 100, watchedAt: 200 }, "watched", 300)).toEqual({ watchlistedAt: 100, watchedAt: 200 });
  expect(titleStatusDates({ status: "shortlist", watchlistedAt: 100, watchedAt: null }, "shortlist", 300)).toEqual({ watchlistedAt: 100, watchedAt: null });
});

test("does not invent dates for existing legacy statuses", () => {
  expect(titleStatusDates({ status: "shortlist", watchlistedAt: null, watchedAt: null }, "shortlist", 300)).toEqual({ watchlistedAt: null, watchedAt: null });
});
