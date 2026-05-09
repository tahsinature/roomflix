import { useNavigate } from "react-router-dom";
import { Ban, Play, Users } from "lucide-react";
import type { RoomListItem, Video, VideoHealth } from "@shared/protocol";
import { Button } from "@/components/ui/button";
import {
  findActiveRoomFor,
  pathForNewRoomPlaying,
  urlIsClearlyNotVideo,
} from "@/lib/play";

type Props = {
  video: Pick<Video, "url">;
  rooms: RoomListItem[];
  // When defined and `health.video === "gone"`, the button disables itself.
  // Undefined or "ok"/"unverified" lets the click through.
  health?: VideoHealth;
  size?: "sm" | "default";
};

// Smart play: if a room is already playing this URL, join it; otherwise
// spawn a fresh room with the URL pre-loaded via ?video=.
export function PlayButton({ video, rooms, health, size = "sm" }: Props) {
  const navigate = useNavigate();
  const active = findActiveRoomFor(video.url, rooms);
  const isGone = health?.video === "gone";
  const notVideo = urlIsClearlyNotVideo(video.url);

  if (isGone || notVideo) {
    return (
      <Button
        variant="outline"
        size={size}
        disabled
        title={
          isGone
            ? "URL is unreachable. Verify it on the library page."
            : "This URL doesn't look like a video file."
        }
      >
        <Ban className="h-3.5 w-3.5" />
        {isGone ? "Unavailable" : "Not a video"}
      </Button>
    );
  }

  const onClick = () => {
    const target = active
      ? `/room/${encodeURIComponent(active.id)}`
      : pathForNewRoomPlaying(video.url);
    navigate(target);
  };

  return (
    <Button variant="accent" size={size} onClick={onClick}>
      {active ? (
        <>
          <Users className="h-3.5 w-3.5" />
          Join · {active.viewers}
        </>
      ) : (
        <>
          <Play className="h-3.5 w-3.5 fill-current" />
          Play
        </>
      )}
    </Button>
  );
}
