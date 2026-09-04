import type { DiscoverTitleDetails } from "@shared/protocol";

export type TitleActionGroup = "download" | "search";

export type ExternalTitleAction = {
  id: string;
  label: string;
  group: TitleActionGroup;
  url: string;
};

type ExternalTitleActionSource = Pick<DiscoverTitleDetails, "mediaType" | "title" | "tmdbId" | "year"> & {
  imdbId?: string | null;
};

export function externalTitleActions(details: DiscoverTitleDetails): ExternalTitleAction[] {
  return externalTitleActionsForTitle(details);
}

export function externalTitleActionsForTitle(source: ExternalTitleActionSource): ExternalTitleAction[] {
  const title = encodeURIComponent(source.title);
  const titleAndYear = encodeURIComponent([source.title, source.year].filter(Boolean).join(" "));
  const actions: Array<ExternalTitleAction | null> = [
    source.imdbId
      ? {
          id: "extto",
          label: "extto",
          group: "download",
          url: `https://search.extto.com/browse/?imdb_id=${encodeURIComponent(source.imdbId)}`,
        }
      : null,
    {
      id: "1337x",
      label: "1337x",
      group: "download",
      url: `https://1337x.to/search/${titleAndYear}/1/`,
    },
    source.imdbId
      ? {
          id: "imdb",
          label: "IMDb",
          group: "search",
          url: `https://www.imdb.com/title/${encodeURIComponent(source.imdbId)}/`,
        }
      : null,
    {
      id: "youtube",
      label: "YouTube",
      group: "search",
      url: `https://www.youtube.com/results?search_query=${titleAndYear}+trailer`,
    },
    {
      id: "letterboxd",
      label: "Letterboxd",
      group: "search",
      url: `https://letterboxd.com/search/${title}/`,
    },
    {
      id: "google",
      label: "Google",
      group: "search",
      url: `https://www.google.com/search?q=${titleAndYear}`,
    },
    {
      id: "tmdb",
      label: "TMDB",
      group: "search",
      url: `https://www.themoviedb.org/${source.mediaType}/${source.tmdbId}`,
    },
  ];
  return actions.filter((action): action is ExternalTitleAction => action !== null);
}

export function imdbSearchUrl(title: string, year: string): string {
  return `https://www.imdb.com/find/?q=${encodeURIComponent([title, year].filter(Boolean).join(" "))}`;
}

export function parentsGuideUrl(imdbId: string): string {
  return `https://www.imdb.com/title/${encodeURIComponent(imdbId)}/parentalguide`;
}

export function openExternalAction(url: string): void {
  const opened = window.open(url, "_blank", "noopener,noreferrer");
  if (opened) opened.opener = null;
}

export function preferredRegion(): string {
  try {
    return new Intl.Locale(navigator.language).region ?? "US";
  } catch {
    return "US";
  }
}

export function certificationFor(details: DiscoverTitleDetails): { region: string; value: string } | null {
  const region = preferredRegion();
  const selectedRegion = [region, "US", ...Object.keys(details.certifications)].find((candidate) => details.certifications[candidate]);
  return selectedRegion ? { region: selectedRegion, value: details.certifications[selectedRegion] } : null;
}
