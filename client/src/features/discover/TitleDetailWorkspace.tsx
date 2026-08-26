import { useRef, useState, type ReactNode } from "react";
import { Activity, Info, MapPin, Sparkles, UsersRound, Youtube, type LucideIcon } from "lucide-react";
import type { DiscoverTitleDetails, TitleLibraryItem } from "@shared/protocol";
import { cn } from "@/lib/utils";
import { PulseLabPrototype } from "./PulseLabPrototype";
import { SectionLabel, TitleCast, TitleFacts } from "./TitleDetailSections";
import { TrailerGallery, WhereToWatch } from "./TitleMediaSections";
import { TitleGrid } from "./TitleGrid";
import { TitleWatchState } from "./TitleWatchState";
import { TitleActionBar } from "./TitleActions";
import type { TitleSelection } from "./discover-utils";

type DetailSection = "overview" | "cast" | "trailers" | "providers" | "recommendations" | "pulse";
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
  onSave,
  onRemove,
}: {
  details: DiscoverTitleDetails;
  library: TitleLibraryItem[];
  existing?: TitleLibraryItem;
  onSelectTitle: (selection: TitleSelection) => void;
  onSelectPerson: (tmdbId: number) => void;
  onSave: (item: LibraryPayload) => Promise<void>;
  onRemove: (mediaType: TitleSelection["mediaType"], tmdbId: number) => Promise<void>;
}) {
  const [activeSection, setActiveSection] = useState<DetailSection>("overview");
  const panelRef = useRef<HTMLDivElement>(null);
  const options: SectionOption[] = [{ id: "overview", label: "Overview", icon: Info }];

  if (details.cast.length) options.push({ id: "cast", label: "Cast", icon: UsersRound });
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
      <aside className="lg:sticky lg:top-[84px] lg:self-start">
        <nav
          aria-label="Title sections"
          className="sticky top-[60px] z-20 grid grid-cols-3 border border-border bg-background/95 p-1.5 shadow-[0_12px_30px_-24px_rgba(0,0,0,0.9)] sm:top-[68px] lg:static lg:grid-cols-1"
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
                  "flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 border border-transparent px-2 py-2 text-[10px] font-medium transition-[color,background-color,border-color] focus-visible:ring-2 focus-visible:ring-accent/60 lg:min-h-11 lg:flex-row lg:justify-start lg:gap-2 lg:px-2.5",
                  active ? "border-accent/35 bg-accent/10 text-accent" : "text-muted-foreground hover:bg-white/[0.035] hover:text-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">{option.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      <div ref={panelRef} className="min-w-0 scroll-mt-[13rem] lg:scroll-mt-[6rem]">
        <div key={activeSection} className="view-enter">
          <DetailContent
            section={activeSection}
            details={details}
            library={library}
            existing={existing}
            onSelectTitle={onSelectTitle}
            onSelectPerson={onSelectPerson}
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
  onSave,
  onRemove,
}: {
  section: DetailSection;
  details: DiscoverTitleDetails;
  library: TitleLibraryItem[];
  existing?: TitleLibraryItem;
  onSelectTitle: (selection: TitleSelection) => void;
  onSelectPerson: (tmdbId: number) => void;
  onSave: (item: LibraryPayload) => Promise<void>;
  onRemove: (mediaType: TitleSelection["mediaType"], tmdbId: number) => Promise<void>;
}): ReactNode {
  if (section === "overview") {
    return (
      <div className="flex flex-col gap-6">
        <TitleFacts details={details} onSelectPerson={onSelectPerson} />
        <TitleWatchState details={details} existing={existing} onSave={onSave} onRemove={onRemove} />
        <TitleActionBar details={details} />
      </div>
    );
  }
  if (section === "cast") return <TitleCast details={details} onSelectPerson={onSelectPerson} />;
  if (section === "trailers") return <TrailerGallery details={details} />;
  if (section === "providers") return <WhereToWatch providers={details.watchProviders} />;
  if (section === "pulse" && details.runtime) return <PulseLabPrototype title={details.title} runtimeMinutes={details.runtime} />;
  if (section === "recommendations") {
    return (
      <section>
        <SectionLabel>More Like This</SectionLabel>
        <div className="mt-3">
          <TitleGrid titles={details.recommendations} library={library} onSelect={onSelectTitle} compact />
        </div>
      </section>
    );
  }
  return null;
}
