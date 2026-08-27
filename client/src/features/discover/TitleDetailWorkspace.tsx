import { useRef, type ReactNode } from "react";
import { Activity, Info, ListVideo, MapPin, Sparkles, UsersRound, Youtube, type LucideIcon } from "lucide-react";
import type { DiscoverTitleDetails, TitleLibraryItem } from "@shared/protocol";
import { cn } from "@/lib/utils";
import { PulseLabPrototype } from "./PulseLabPrototype";
import { TitleCastAndCrew, TitleFacts } from "./TitleDetailSections";
import { TrailerGallery } from "./TrailerGallery";
import { WhereToWatch } from "./TitleMediaSections";
import { TitleWatchState } from "./TitleWatchState";
import { TitleActionBar } from "./TitleActions";
import type { TitleSelection } from "./discover-utils";
import { useHistoryEntryState } from "@/navigation/history-entry-memory";
import { RecommendationSection } from "./RecommendationSection";
import { EpisodeBrowser } from "./EpisodeBrowser";
import type { EpisodeSelection } from "./discover-utils";

type DetailSection = "overview" | "episodes" | "cast" | "trailers" | "providers" | "recommendations" | "pulse";
type LibraryPayload = Omit<TitleLibraryItem, "id" | "userId" | "addedAt" | "updatedAt">;

type SectionOption = {
  id: DetailSection;
  label: string;
  icon: LucideIcon;
};

export function TitleDetailWorkspace({
  details,
  library,
  existing,
  onSelectTitle,
  onSelectPerson,
  onOpenPersonGallery,
  onSelectEpisode,
  onSave,
  onRemove,
}: {
  details: DiscoverTitleDetails;
  library: TitleLibraryItem[];
  existing?: TitleLibraryItem;
  onSelectTitle: (selection: TitleSelection) => void;
  onSelectPerson: (tmdbId: number) => void;
  onOpenPersonGallery: (tmdbId: number) => void;
  onSelectEpisode: (selection: EpisodeSelection) => void;
  onSave: (item: LibraryPayload) => Promise<void>;
  onRemove: (mediaType: TitleSelection["mediaType"], tmdbId: number) => Promise<void>;
}) {
  const [activeSection, setActiveSection] = useHistoryEntryState<DetailSection>("discover.title-section", "overview");
  const panelRef = useRef<HTMLDivElement>(null);
  const options: SectionOption[] = [{ id: "overview", label: "Overview", icon: Info }];

  if (details.mediaType === "tv" && details.seasons.length) options.push({ id: "episodes", label: "Episodes", icon: ListVideo });
  if (details.directors.length || details.cast.length) options.push({ id: "cast", label: "Cast & Crew", icon: UsersRound });
  if (details.trailers.length) options.push({ id: "trailers", label: "Trailers", icon: Youtube });
  if (Object.keys(details.watchProviders).length) options.push({ id: "providers", label: "Where to Watch", icon: MapPin });
  if (details.recommendations.length) options.push({ id: "recommendations", label: "More Like This", icon: Sparkles });
  if (details.mediaType === "movie" && details.runtime) options.push({ id: "pulse", label: "Pulse Lab", icon: Activity });

  const selectSection = (section: DetailSection) => {
    if (section === activeSection) return;
    setActiveSection(section);
    window.requestAnimationFrame(() => {
      panelRef.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    });
  };

  return (
    <div className="grid min-w-0 gap-5 lg:grid-cols-[11rem_minmax(0,1fr)] lg:gap-7">
      <aside className="sticky top-[4.5rem] z-20 -mx-2 self-start sm:top-[5rem] lg:top-[5.75rem] lg:mx-0">
        <nav
          aria-label="Title sections"
          className="grid grid-cols-3 gap-1 rounded-xl border border-white/[0.08] bg-background/80 p-1.5 shadow-[0_18px_36px_-24px_rgba(0,0,0,0.95)] backdrop-blur-xl lg:flex lg:flex-col lg:rounded-lg"
        >
          {options.map((option) => {
            const Icon = option.icon;
            const active = activeSection === option.id;
            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={active}
                onClick={() => selectSection(option.id)}
                className={cn(
                  "flex min-h-10 min-w-0 items-center justify-center gap-2 rounded-lg border border-transparent px-2 py-2 text-[10px] font-medium transition-[color,background-color,border-color,box-shadow] focus-visible:ring-2 focus-visible:ring-accent/60 lg:min-h-11 lg:justify-start lg:px-2.5",
                  active
                    ? "border-accent/25 bg-accent/10 text-accent shadow-[inset_0_0_18px_hsl(var(--accent)/0.04)]"
                    : "text-muted-foreground hover:bg-white/[0.035] hover:text-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="line-clamp-2 min-w-0 text-center leading-tight lg:text-left">{option.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      <div ref={panelRef} className="min-w-0 scroll-mt-[8rem] lg:scroll-mt-[6rem]">
        <div key={activeSection} className="view-enter">
          <DetailContent
            section={activeSection}
            details={details}
            library={library}
            existing={existing}
            onSelectTitle={onSelectTitle}
            onSelectPerson={onSelectPerson}
            onOpenPersonGallery={onOpenPersonGallery}
            onSelectEpisode={onSelectEpisode}
            onSave={onSave}
            onRemove={onRemove}
          />
        </div>
      </div>
    </div>
  );
}

function DetailContent({
  section,
  details,
  library,
  existing,
  onSelectTitle,
  onSelectPerson,
  onOpenPersonGallery,
  onSelectEpisode,
  onSave,
  onRemove,
}: {
  section: DetailSection;
  details: DiscoverTitleDetails;
  library: TitleLibraryItem[];
  existing?: TitleLibraryItem;
  onSelectTitle: (selection: TitleSelection) => void;
  onSelectPerson: (tmdbId: number) => void;
  onOpenPersonGallery: (tmdbId: number) => void;
  onSelectEpisode: (selection: EpisodeSelection) => void;
  onSave: (item: LibraryPayload) => Promise<void>;
  onRemove: (mediaType: TitleSelection["mediaType"], tmdbId: number) => Promise<void>;
}): ReactNode {
  if (section === "overview") {
    return (
      <div className="flex min-w-0 flex-col gap-6">
        <TitleFacts details={details} />
        <TitleWatchState details={details} existing={existing} onSave={onSave} onRemove={onRemove} />
        <TitleActionBar details={details} />
      </div>
    );
  }
  if (section === "episodes") return <EpisodeBrowser details={details} onSelectEpisode={onSelectEpisode} />;
  if (section === "cast") return <TitleCastAndCrew details={details} onSelectPerson={onSelectPerson} onOpenPersonGallery={onOpenPersonGallery} />;
  if (section === "trailers") return <TrailerGallery details={details} />;
  if (section === "providers") return <WhereToWatch providers={details.watchProviders} />;
  if (section === "pulse" && details.runtime) return <PulseLabPrototype title={details.title} runtimeMinutes={details.runtime} />;
  if (section === "recommendations") return <RecommendationSection details={details} library={library} onSelectTitle={onSelectTitle} />;
  return null;
}
