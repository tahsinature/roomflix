import { useEffect, useMemo, useState, type ReactNode } from "react";
import * as ContextMenu from "@radix-ui/react-context-menu";
import { ChevronRight, Download, ExternalLink, Film, LoaderCircle, Magnet } from "lucide-react";
import type { DiscoverSearchResult } from "@shared/protocol";
import { cn } from "@/lib/utils";
import { externalTitleActionsForTitle, imdbSearchUrl, openExternalAction } from "./title-actions";
import { loadTitleDetails } from "./title-details-cache";

type TitleCardContextMenuProps = {
  title: DiscoverSearchResult;
  knownImdbId?: string | null;
  children: ReactNode;
};

const menuSurface =
  "z-[10000] min-w-52 overflow-hidden border border-white/10 bg-[hsl(var(--bg-elevated)/0.98)] p-1.5 text-foreground shadow-[0_18px_55px_-18px_rgba(0,0,0,0.9),0_0_0_1px_hsl(var(--accent)/0.06)] backdrop-blur-xl animate-fade-in";
const menuItem =
  "group flex min-h-9 select-none items-center gap-2.5 px-2.5 text-[11px] outline-none transition-colors data-[highlighted]:bg-accent/[0.12] data-[highlighted]:text-accent data-[disabled]:pointer-events-none data-[disabled]:text-text-dim";

export function TitleCardContextMenu({ title, knownImdbId, children }: TitleCardContextMenuProps) {
  const [imdbId, setImdbId] = useState<string | null | undefined>(knownImdbId);
  const [resolvingImdb, setResolvingImdb] = useState(false);

  useEffect(() => {
    if (knownImdbId !== undefined) setImdbId(knownImdbId);
  }, [knownImdbId]);

  const actions = useMemo(
    () =>
      externalTitleActionsForTitle({
        tmdbId: title.tmdbId,
        mediaType: title.mediaType,
        title: title.title,
        year: title.year,
        imdbId,
      }),
    [imdbId, title.mediaType, title.title, title.tmdbId, title.year],
  );
  const imdbUrl = actions.find((action) => action.id === "imdb")?.url ?? (imdbId === null ? imdbSearchUrl(title.title, title.year) : null);
  const downloadActions = actions.filter((action) => action.group === "download");

  const resolveImdbId = () => {
    if (imdbId !== undefined || resolvingImdb) return;

    setResolvingImdb(true);
    void loadTitleDetails(title)
      .then((details) => setImdbId(details.imdbId))
      .catch(() => setImdbId(null))
      .finally(() => setResolvingImdb(false));
  };

  return (
    <ContextMenu.Root onOpenChange={(open) => open && resolveImdbId()}>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className={menuSurface} collisionPadding={8}>
          <ContextMenu.Label className="max-w-64 truncate border-b border-white/[0.06] px-2.5 pb-2 pt-1 text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
            {title.title}
            {title.year ? <span className="ml-2 text-text-dim">{title.year}</span> : null}
          </ContextMenu.Label>

          <ContextMenu.Item disabled={!imdbUrl} className={cn(menuItem, "mt-1")} onSelect={() => imdbUrl && openExternalAction(imdbUrl)}>
            {resolvingImdb ? (
              <LoaderCircle className="h-3.5 w-3.5 animate-spin text-accent" />
            ) : (
              <Film className="h-3.5 w-3.5 text-muted-foreground group-data-[highlighted]:text-accent" />
            )}
            <span>{resolvingImdb ? "Finding IMDb title…" : "Open in IMDb"}</span>
            {!resolvingImdb ? <ExternalLink className="ml-auto h-3 w-3 text-text-dim" /> : null}
          </ContextMenu.Item>

          <ContextMenu.Separator className="my-1 h-px bg-white/[0.06]" />

          <ContextMenu.Sub>
            <ContextMenu.SubTrigger className={menuItem}>
              <Download className="h-3.5 w-3.5 text-muted-foreground group-data-[highlighted]:text-accent" />
              <span>Download</span>
              <ChevronRight className="ml-auto h-3.5 w-3.5 text-text-dim group-data-[state=open]:text-accent" />
            </ContextMenu.SubTrigger>
            <ContextMenu.Portal>
              <ContextMenu.SubContent className={menuSurface} sideOffset={5} alignOffset={-5} collisionPadding={8}>
                <ContextMenu.Label className="border-b border-white/[0.06] px-2.5 pb-2 pt-1 text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
                  External sources
                </ContextMenu.Label>
                <div className="mt-1">
                  {downloadActions.map((action) => {
                    const Icon = action.id === "1337x" ? Magnet : Download;
                    return (
                      <ContextMenu.Item key={action.id} className={menuItem} onSelect={() => openExternalAction(action.url)}>
                        <Icon className="h-3.5 w-3.5 text-muted-foreground group-data-[highlighted]:text-accent" />
                        <span>{action.label}</span>
                        <ExternalLink className="ml-auto h-3 w-3 text-text-dim" />
                      </ContextMenu.Item>
                    );
                  })}
                  {resolvingImdb ? (
                    <ContextMenu.Item disabled className={menuItem}>
                      <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                      <span>Finding more sources…</span>
                    </ContextMenu.Item>
                  ) : null}
                </div>
              </ContextMenu.SubContent>
            </ContextMenu.Portal>
          </ContextMenu.Sub>

          <p className="mt-1 border-t border-white/[0.06] px-2.5 pb-1 pt-2 text-[8px] uppercase tracking-[0.12em] text-text-dim">Opens in a new tab</p>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
