import { Bookmark, CircleCheck } from "lucide-react";

export const TITLE_LIBRARY_STATUSES = {
  shortlist: { label: "In watchlist", action: "Added to watchlist", path: "/discover/watchlist", icon: Bookmark, color: "text-amber-300" },
  watched: { label: "Watched", action: "Marked watched", path: "/discover/watched", icon: CircleCheck, color: "text-cyan" },
};
