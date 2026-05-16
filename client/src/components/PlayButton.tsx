import { useNavigate } from "react-router-dom";
import { Ban, Play } from "lucide-react";
import type { Video, VideoHealth } from "@shared/protocol";
import { Button } from "@/components/ui/button";
import { pathForWatchWithUrl, urlIsClearlyNotMedia } from "@/lib/play";

type Props = {
  video: Pick<Video, "url">;
  // When defined and `health.video === "gone"`, the button disables itself.
  // Undefined or "ok"/"unverified" lets the click through.
  health?: VideoHealth;
  size?: "sm" | "default";
};

// Sends the user to the single per-space watch surface with the URL
// pre-loaded. Whoever else is in the space sees the same load.
export function PlayButton({ video, health, size = "sm" }: Props) {
  const navigate = useNavigate();
  const isGone = health?.video === "gone";
  const notMedia = urlIsClearlyNotMedia(video.url);

  if (isGone || notMedia) {
    return (
      <Button
        variant="outline"
        size={size}
        disabled
        title={isGone ? "URL is unreachable. Verify it on the library page." : "This URL doesn't look like a media file."}
      >
        <Ban className="h-3.5 w-3.5" />
        {isGone ? "Unavailable" : "Not media"}
      </Button>
    );
  }

  return (
    <Button variant="accent" size={size} onClick={() => navigate(pathForWatchWithUrl(video.url))}>
      <Play className="h-3.5 w-3.5 fill-current" />
      Play
    </Button>
  );
}
