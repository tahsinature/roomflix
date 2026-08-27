import { useMemo } from "react";
import type { DiscoverTitleDetails, TitleLibraryItem } from "@shared/protocol";
import { useAuth } from "@/auth/AuthContext";
import { useToast } from "@/components/Toast";
import { SectionLabel } from "./TitleDetailSections";
import { TitleGrid } from "./TitleGrid";
import type { TitleSelection } from "./discover-utils";
import { sortRecommendations, type RecommendationSort } from "./recommendation-sort";

export function RecommendationSection({
  details,
  library,
  onSelectTitle,
}: {
  details: DiscoverTitleDetails;
  library: TitleLibraryItem[];
  onSelectTitle: (selection: TitleSelection) => void;
}) {
  const { user, updatePreferences } = useAuth();
  const toast = useToast();
  const sort = user?.preferences.discover.moreLikeThisSort ?? "recommended";
  const titles = useMemo(() => sortRecommendations(details.recommendations, sort), [details.recommendations, sort]);

  const saveSort = (nextSort: RecommendationSort) => {
    void updatePreferences({ discover: { moreLikeThisSort: nextSort } }).catch(() => {
      toast.error("Couldn't save your More Like This sort setting.");
    });
  };

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <SectionLabel>More Like This</SectionLabel>
          <p className="mt-1 font-mono text-[9px] text-text-dim">{titles.length} related titles</p>
        </div>
        <label className="flex min-h-10 items-center gap-2 font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
          Sort
          <select
            value={sort}
            onChange={(event) => saveSort(event.target.value as RecommendationSort)}
            className="h-10 border border-border bg-input px-3 text-[10px] normal-case tracking-normal text-foreground transition-colors hover:border-border-hover focus:border-accent/55"
          >
            <option value="recommended">Recommended</option>
            <option value="rating">Rating</option>
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="title">Title A–Z</option>
          </select>
        </label>
      </div>
      <div className="mt-3">
        <TitleGrid titles={titles} library={library} onSelect={onSelectTitle} compact />
      </div>
    </section>
  );
}
