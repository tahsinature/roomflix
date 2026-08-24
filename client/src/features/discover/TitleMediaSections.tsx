import { useMemo, useState } from "react";
import { ExternalLink, MapPin, Play, Youtube } from "lucide-react";
import type { DiscoverRegionProviders, DiscoverTitleDetails, DiscoverWatchProvider } from "@shared/protocol";
import { SectionLabel } from "./TitleDetailSections";

const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w92";

export function TitleMediaSections({ details }: { details: DiscoverTitleDetails }) {
  return (
    <>
      <WhereToWatch providers={details.watchProviders} />
      <TrailerGallery details={details} />
    </>
  );
}

function WhereToWatch({ providers }: { providers: Record<string, DiscoverRegionProviders> }) {
  const regions = useMemo(() => Object.keys(providers).sort(), [providers]);
  const [region, setRegion] = useState(() => preferredRegion(regions));
  const selectedRegion = regions.includes(region) ? region : preferredRegion(regions);
  const current = providers[selectedRegion];
  if (!regions.length || !current) return null;

  const groups = [
    { label: "Stream", items: current.stream },
    { label: "Free", items: current.free },
    { label: "With ads", items: current.ads },
    { label: "Rent", items: current.rent },
    { label: "Buy", items: current.buy },
  ].filter((group) => group.items.length > 0);

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <SectionLabel>Where to watch</SectionLabel>
          <p className="mt-1 text-[9px] text-text-dim">Availability supplied by JustWatch through TMDB.</p>
        </div>
        <label className="flex items-center gap-2 text-[9px] uppercase tracking-[0.13em] text-muted-foreground">
          <MapPin className="h-3.5 w-3.5" />
          Region
          <select value={selectedRegion} onChange={(event) => setRegion(event.target.value)} className="h-8 border border-border bg-input px-2 text-[10px] text-foreground">
            {regions.map((code) => (
              <option key={code} value={code}>
                {regionName(code)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-3 border border-border bg-background/35 p-4">
        {groups.length ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {groups.map((group) => (
              <ProviderGroup key={group.label} label={group.label} providers={group.items} />
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No providers are listed for this region.</p>
        )}
        {current.link ? (
          <a
            href={current.link}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] text-cyan hover:text-foreground"
          >
            View complete availability <ExternalLink className="h-3 w-3" />
          </a>
        ) : null}
      </div>
    </section>
  );
}

function ProviderGroup({ label, providers }: { label: string; providers: DiscoverWatchProvider[] }) {
  return (
    <div>
      <p className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {providers.map((provider) => (
          <span key={provider.providerId} className="inline-flex items-center gap-2 border border-border bg-card/70 p-1.5 pr-2.5 text-[10px]">
            {provider.logoPath ? <img src={`${TMDB_IMAGE_BASE}${provider.logoPath}`} alt="" loading="lazy" className="h-7 w-7" /> : <Play className="h-4 w-4 text-text-dim" />}
            {provider.name}
          </span>
        ))}
      </div>
    </div>
  );
}

function TrailerGallery({ details }: { details: DiscoverTitleDetails }) {
  if (!details.trailers.length) return null;
  return (
    <section>
      <SectionLabel>Trailers</SectionLabel>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {details.trailers.slice(0, 4).map((trailer) => (
          <a
            key={trailer.id}
            href={`https://www.youtube.com/watch?v=${encodeURIComponent(trailer.youtubeKey)}`}
            target="_blank"
            rel="noreferrer"
            className="group relative aspect-video overflow-hidden border border-border bg-black"
          >
            <img
              src={`https://i.ytimg.com/vi/${encodeURIComponent(trailer.youtubeKey)}/hqdefault.jpg`}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover opacity-70 transition duration-300 group-hover:scale-[1.03] group-hover:opacity-90"
            />
            <span className="absolute inset-0 grid place-items-center">
              <span className="grid h-10 w-10 place-items-center border border-white/25 bg-black/70 text-accent backdrop-blur-sm">
                <Youtube className="h-5 w-5" />
              </span>
            </span>
            <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/90 to-transparent px-3 pb-2 pt-8">
              <span className="line-clamp-1 block text-[10px] font-semibold text-white">{trailer.name}</span>
              <span className="mt-0.5 block text-[8px] uppercase tracking-[0.13em] text-white/55">
                {trailer.type}
                {trailer.official ? " · Official" : ""}
              </span>
            </span>
          </a>
        ))}
      </div>
    </section>
  );
}

function preferredRegion(regions: string[]): string {
  if (!regions.length) return "";
  try {
    const browserRegion = new Intl.Locale(navigator.language).maximize().region;
    if (browserRegion && regions.includes(browserRegion)) return browserRegion;
  } catch {
    // Older browsers may not provide Intl.Locale.
  }
  return regions.includes("US") ? "US" : regions[0];
}

function regionName(code: string): string {
  try {
    return new Intl.DisplayNames(undefined, { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}
