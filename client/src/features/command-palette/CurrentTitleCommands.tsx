import { Bookmark, BookmarkX, CalendarDays, Check, Clapperboard, Copy, Download, Film, Globe2, Images, Link2, Magnet, Star, Youtube } from "lucide-react";
import type { DiscoverTitleDetails, TitleLibraryItem, TitleLibraryStatus } from "@shared/protocol";
import { useToast } from "@/components/Toast";
import { CommandGroup, CommandItem, CommandShortcut } from "@/components/ui/command";
import { externalTitleActions, openExternalAction } from "@/features/discover/title-actions";
import { posterUrl } from "@/features/discover/discover-utils";
import { copyPosterImage, downloadPoster, posterFilename } from "@/lib/poster-actions";

const ACTION_ICONS = {
  extto: Download,
  "1337x": Magnet,
  imdb: Film,
  youtube: Youtube,
  letterboxd: Star,
  google: Globe2,
  tmdb: Clapperboard,
};

export function CurrentTitleCommands({
  details,
  libraryItem,
  onClose,
  onSaveStatus,
  onRemove,
}: {
  details: DiscoverTitleDetails;
  libraryItem?: TitleLibraryItem;
  onClose: () => void;
  onSaveStatus: (status: TitleLibraryStatus) => Promise<void>;
  onRemove: () => Promise<void>;
}) {
  const toast = useToast();
  const runAndClose = (action: () => void | Promise<void>) => {
    onClose();
    void action();
  };

  return (
    <CommandGroup heading={`Current title · ${details.title}`}>
      <CommandItem value={`copy title ${details.title}`} onSelect={() => runAndClose(() => copyText(details.title, "Title copied.", toast))}>
        <Copy /> Copy title
      </CommandItem>
      <CommandItem
        value={`copy title year ${details.title}`}
        onSelect={() => runAndClose(() => copyText(`${details.title}${details.year ? ` (${details.year})` : ""}`, "Title and year copied.", toast))}
      >
        <CalendarDays /> Copy title and year
      </CommandItem>
      {details.posterPath ? <PosterCommands details={details} runAndClose={runAndClose} /> : null}
      <CommandItem value={`watchlist shortlist ${details.title}`} onSelect={() => runAndClose(() => onSaveStatus("shortlist"))}>
        <Bookmark /> {libraryItem?.status === "shortlist" ? "Keep in watchlist" : "Add to watchlist"}
      </CommandItem>
      <CommandItem value={`watched ${details.title}`} onSelect={() => runAndClose(() => onSaveStatus("watched"))}>
        <Check /> {libraryItem?.status === "watched" ? "Already watched" : "Mark watched"}
      </CommandItem>
      {libraryItem ? (
        <CommandItem value={`remove library ${details.title}`} onSelect={() => runAndClose(onRemove)}>
          <BookmarkX /> Remove from library
        </CommandItem>
      ) : null}
      {externalTitleActions(details).map((action) => {
        const Icon = ACTION_ICONS[action.id as keyof typeof ACTION_ICONS] ?? Link2;
        return (
          <CommandItem key={action.id} value={`open ${action.label} ${action.group} ${details.title}`} onSelect={() => runAndClose(() => openExternalAction(action.url))}>
            <Icon /> Open in {action.label}
            <CommandShortcut>{action.group}</CommandShortcut>
          </CommandItem>
        );
      })}
    </CommandGroup>
  );
}

function PosterCommands({ details, runAndClose }: { details: DiscoverTitleDetails; runAndClose: (action: () => void | Promise<void>) => void }) {
  const toast = useToast();
  const fullPoster = posterUrl(details.posterPath, "original")!;
  const clipboardPoster = posterUrl(details.posterPath, "w780")!;
  return (
    <>
      <CommandItem
        value={`copy poster image ${details.title}`}
        onSelect={() =>
          runAndClose(async () => {
            const result = await copyPosterImage(clipboardPoster);
            toast.success(result === "image" ? "Poster copied to the clipboard." : "Poster URL copied.");
          })
        }
      >
        <Images /> Copy poster image
      </CommandItem>
      <CommandItem
        value={`download poster ${details.title}`}
        onSelect={() =>
          runAndClose(async () => {
            const result = await downloadPoster(fullPoster, posterFilename(details.title, details.year));
            toast.success(result === "downloaded" ? "Poster downloaded." : "Poster opened in a new tab.");
          })
        }
      >
        <Download /> Download poster
      </CommandItem>
      <CommandItem value={`copy poster url ${details.title}`} onSelect={() => runAndClose(() => copyText(fullPoster, "Poster URL copied.", toast))}>
        <Link2 /> Copy poster URL
      </CommandItem>
    </>
  );
}

async function copyText(value: string, message: string, toast: ReturnType<typeof useToast>): Promise<void> {
  await navigator.clipboard.writeText(value);
  toast.success(message);
}
