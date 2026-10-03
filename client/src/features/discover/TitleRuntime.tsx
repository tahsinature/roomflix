import { Clock3 } from "lucide-react";
import type { DiscoverMediaType } from "@shared/protocol";
import { TitleMetadataCard } from "./TitleMetadataCard";
import { formatRuntime } from "./discover-utils";

export function TitleRuntime({ minutes, mediaType }: { minutes: number | null; mediaType: DiscoverMediaType }) {
  const label = mediaType === "tv" ? "Per episode" : "Runtime";
  const duration = minutes && minutes > 0 ? formatRuntime(minutes) : "Unknown";

  return <TitleMetadataCard label={label} icon={Clock3} value={duration} caption={mediaType === "tv" ? "Episode length" : "Movie length"} />;
}
