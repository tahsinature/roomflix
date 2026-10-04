import { useEffect, useRef, useState } from "react";
import type { DiscoverSeriesStatus } from "@shared/protocol";
import { loadSeriesStatus } from "./series-status-cache";
import { SeriesStatusIndicator } from "./SeriesStatusIndicator";

export function SeriesCardStatus({ tmdbId, inline = false }: { tmdbId: number; inline?: boolean }) {
  const anchor = useRef<HTMLSpanElement>(null);
  const [data, setData] = useState<DiscoverSeriesStatus | null>(null);
  useEffect(() => {
    let cancelled = false;
    setData(null);
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      void loadSeriesStatus(tmdbId).then((value) => {
        if (!cancelled) setData(value);
      });
    });
    if (anchor.current) observer.observe(anchor.current);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [tmdbId]);
  return (
    <span ref={anchor} className={inline ? "inline-flex size-3.5 shrink-0 items-center" : "absolute right-2 top-2 z-10 size-5"}>
      {data ? (
        <SeriesStatusIndicator data={data} className={inline ? undefined : "grid size-5 place-items-center rounded-[4px] border border-white/20 bg-black/85 shadow-sm"} />
      ) : null}
    </span>
  );
}
