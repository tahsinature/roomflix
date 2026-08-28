// Open-Meteo client. Free, no API key, CORS-friendly — we call it
// directly from the browser. Two-step lookup: city name → coords via
// the geocoding endpoint, then coords → current temperature + weather
// code via the forecast endpoint. Cached at module scope so a page
// re-render doesn't re-hit the network; in-flight requests for the
// same city are deduped.
//
// The cache key is the lowercased trimmed city — same query string,
// same cache slot. TTL is 30 min: weather is slow-moving and the
// members menu isn't a meteorology surface.

export type Weather = {
  tempC: number;
  code: number; // WMO weather code; see weatherIcon()
  resolvedName: string;
};

type CacheEntry = {
  weather: Weather | null; // null = lookup failed; don't retry hot
  fetchedAt: number;
};

const TTL_MS = 30 * 60 * 1000;
const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<Weather | null>>();

export async function getWeatherForCity(city: string): Promise<Weather | null> {
  const key = city.trim().toLowerCase();
  if (!key) return null;

  const cached = cache.get(key);
  if (cached && Date.now() - cached.fetchedAt < TTL_MS) return cached.weather;

  const existing = inflight.get(key);
  if (existing) return existing;

  const p = doFetch(city)
    .then((w) => {
      cache.set(key, { weather: w, fetchedAt: Date.now() });
      return w;
    })
    .finally(() => {
      inflight.delete(key);
    });
  inflight.set(key, p);
  return p;
}

async function doFetch(city: string): Promise<Weather | null> {
  try {
    const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&format=json`;
    const geo = (await fetch(geoUrl).then((r) => (r.ok ? r.json() : null))) as { results?: Array<{ latitude: number; longitude: number; name: string }> } | null;
    const hit = geo?.results?.[0];
    if (!hit) return null;
    const fcUrl = `https://api.open-meteo.com/v1/forecast?latitude=${hit.latitude}&longitude=${hit.longitude}&current=temperature_2m,weather_code&temperature_unit=celsius`;
    const fc = (await fetch(fcUrl).then((r) => (r.ok ? r.json() : null))) as { current?: { temperature_2m: number; weather_code: number } } | null;
    const cur = fc?.current;
    if (!cur || typeof cur.temperature_2m !== "number" || typeof cur.weather_code !== "number") return null;
    return { tempC: cur.temperature_2m, code: cur.weather_code, resolvedName: hit.name };
  } catch {
    return null;
  }
}

// Derive a usable city name from an IANA timezone. Most IANA names are
// `Continent/City` (or `Continent/Region/City`) where the last segment
// is literally a city — Open-Meteo's geocoder accepts those directly.
// Lets the members menu still show weather + a sensible label when a
// user hasn't set their city explicitly in Settings, including the
// localhost case where IP-based geolocation has nothing to work with.
//
// Returns null for tz names that aren't real places: bare "UTC",
// "Etc/GMT+5", numeric offsets, single-segment names, etc.
export function cityFromTimezone(timezone: string | null | undefined): string | null {
  if (!timezone) return null;
  const parts = timezone.split("/");
  if (parts.length < 2) return null;
  const last = parts[parts.length - 1];
  if (!last) return null;
  // Reject offset-style names and the synthetic "Etc/*" zones — they
  // exist only for offset selection and don't map to real cities.
  if (parts[0] === "Etc") return null;
  if (/^(?:GMT|UCT|UTC)|^[+\-]?\d/.test(last)) return null;
  return last.replace(/_/g, " ");
}

// WMO weather code → friendly bucket. Used to pick a lucide icon and a
// hover label. Buckets follow Open-Meteo's published code list:
// https://open-meteo.com/en/docs#weathervariables
export function weatherBucket(code: number): {
  bucket: "clear" | "partly" | "fog" | "drizzle" | "rain" | "snow" | "thunder" | "cloud";
  label: string;
} {
  if (code === 0) return { bucket: "clear", label: "Clear" };
  if (code <= 3) return { bucket: "partly", label: "Partly cloudy" };
  if (code === 45 || code === 48) return { bucket: "fog", label: "Fog" };
  if (code >= 51 && code <= 57) return { bucket: "drizzle", label: "Drizzle" };
  if ((code >= 61 && code <= 65) || (code >= 80 && code <= 82)) return { bucket: "rain", label: "Rain" };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { bucket: "snow", label: "Snow" };
  if (code >= 95) return { bucket: "thunder", label: "Thunderstorm" };
  return { bucket: "cloud", label: "Cloudy" };
}
