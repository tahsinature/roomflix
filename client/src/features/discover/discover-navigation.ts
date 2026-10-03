import { Bookmark, CheckCircle2, Clock3, Compass, GitCompareArrows } from "lucide-react";

export const DISCOVER_SECTIONS = [
  { label: "Explore", path: "/discover", icon: Compass },
  { label: "Watchlist", path: "/discover/watchlist", icon: Bookmark },
  { label: "Watched", path: "/discover/watched", icon: CheckCircle2 },
  { label: "Recent", path: "/discover/recent", icon: Clock3 },
  { label: "Compare", path: "/discover/compare", icon: GitCompareArrows },
];
