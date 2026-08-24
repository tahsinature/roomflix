import type { DiscoverTitleDetails } from "@shared/protocol";

export type TitleActionGroup = "download" | "search";

export type ExternalTitleAction = {
  id: string;
  label: string;
  group: TitleActionGroup;
  url: string;
};

export function externalTitleActions(details: DiscoverTitleDetails): ExternalTitleAction[] {
  const title = encodeURIComponent(details.title);
  const titleAndYear = encodeURIComponent([details.title, details.year].filter(Boolean).join(" "));
  const actions: Array<ExternalTitleAction | null> = [
    details.imdbId
      ? {
          id: "extto",
          label: "extto",
          group: "download",
          url: `https://search.extto.com/browse/?imdb_id=${encodeURIComponent(details.imdbId)}`,
        }
      : null,
    {
      id: "1337x",
      label: "1337x",
      group: "download",
      url: `https://1337x.to/search/${titleAndYear}/1/`,
    },
    details.imdbId
      ? {
          id: "imdb",
          label: "IMDb",
          group: "search",
          url: `https://www.imdb.com/title/${encodeURIComponent(details.imdbId)}/`,
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
      url: `https://www.themoviedb.org/${details.mediaType}/${details.tmdbId}`,
    },
  ];
  return actions.filter((action): action is ExternalTitleAction => action !== null);
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
