import { Clapperboard, Copy, Download, Film, Globe2, Link2, Magnet, Star, Youtube } from "lucide-react";
import type { DiscoverTitleDetails } from "@shared/protocol";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/Toast";
import { copyPosterImage, downloadPoster, posterFilename } from "@/lib/poster-actions";
import { externalTitleActions } from "./title-actions";
import { posterUrl } from "./discover-utils";

const ACTION_ICONS = {
  extto: Download,
  "1337x": Magnet,
  imdb: Film,
  youtube: Youtube,
  letterboxd: Star,
  google: Globe2,
  tmdb: Clapperboard,
};

export function TitlePosterActions({ details }: { details: DiscoverTitleDetails }) {
  const toast = useToast();
  const fullPoster = posterUrl(details.posterPath, "original");
  const clipboardPoster = posterUrl(details.posterPath, "w780");
  if (!fullPoster || !clipboardPoster) return null;

  const copyImage = async () => {
    const result = await copyPosterImage(clipboardPoster);
    toast.success(result === "image" ? "Poster copied to the clipboard." : "Poster image unavailable; copied its URL instead.");
  };
  const download = async () => {
    const result = await downloadPoster(fullPoster, posterFilename(details.title, details.year));
    toast.success(result === "downloaded" ? "Poster downloaded." : "Poster opened in a new tab.");
  };
  const copyUrl = async () => {
    await navigator.clipboard.writeText(fullPoster);
    toast.success("Poster URL copied.");
  };

  return (
    <div className="mt-2 grid grid-cols-3 gap-1.5">
      <PosterButton label="Copy poster image" onClick={() => void copyImage()} icon={Copy} />
      <PosterButton label="Download poster" onClick={() => void download()} icon={Download} />
      <PosterButton label="Copy poster URL" onClick={() => void copyUrl()} icon={Link2} />
    </div>
  );
}

export function TitleActionBar({ details }: { details: DiscoverTitleDetails }) {
  const actions = externalTitleActions(details);
  return (
    <section>
      <h2 className="section-label">Actions</h2>
      <div className="mt-3 border border-border bg-background/35">
        {(["download", "search"] as const).map((group) => (
          <div key={group} className="grid gap-2 border-b border-border px-3 py-3 last:border-b-0 sm:grid-cols-[8rem_1fr]">
            <span className="text-[9px] uppercase tracking-[0.15em] text-muted-foreground">{group}</span>
            <div className="flex flex-wrap gap-2">
              {actions
                .filter((action) => action.group === group)
                .map((action) => {
                  const Icon = ACTION_ICONS[action.id as keyof typeof ACTION_ICONS] ?? Link2;
                  return (
                    <Button key={action.id} asChild size="sm" variant="outline">
                      <a href={action.url} target="_blank" rel="noreferrer">
                        <Icon className="h-3.5 w-3.5" />
                        {action.label}
                      </a>
                    </Button>
                  );
                })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function PosterButton({ label, onClick, icon: Icon }: { label: string; onClick: () => void; icon: typeof Copy }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid h-9 place-items-center border border-white/10 bg-card/85 text-muted-foreground transition hover:border-accent/40 hover:text-accent"
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}
