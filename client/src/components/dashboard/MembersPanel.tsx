import { useEffect, useState } from "react";
import { Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSun, Crown, Snowflake, Sun, User } from "lucide-react";
import type { Participant, PresenceStatus, SpaceMember } from "@shared/protocol";
import { cityFromTimezone, getWeatherForCity, weatherBucket, type Weather } from "@/lib/weather";
import { cn } from "@/lib/utils";

// "Who's in your space, and where." A small panel on the home page.
// One row per member with their local time + current weather.
//
// Inputs:
//   members  — SpaceMember[] from useSessionPresence (durable accounts in
//              the space, regardless of online status).
//   participants — current per-identity presence (status, etc.).
//   meId     — current user id so we mark "you" + bias own row to the top.
//
// Local time uses the member's denormalized `timezone`. Weather is
// fetched once per unique `city` via the module-level cache in
// weather.ts (30-minute TTL). Rows without a timezone or city show "—".
export function MembersPanel({
  members,
  participants,
  meId,
}: {
  members: SpaceMember[];
  participants: Participant[];
  meId: string;
}) {
  // Tick once per minute — only the local-time strings need to refresh.
  const [, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  // City for each member: prefer the one they set explicitly in
  // Settings, fall back to the city embedded in their IANA timezone
  // (e.g. "Asia/Dhaka" → "Dhaka"). The fallback is what lets the panel
  // still show weather for users on localhost where IP geolocation
  // would yield nothing.
  const effectiveCityByUserId = new Map<string, string | null>();
  for (const m of members) {
    effectiveCityByUserId.set(m.userId, m.city ?? cityFromTimezone(m.timezone));
  }

  // Fetch weather per unique city. The cache dedupes if two members
  // share a city; we still keep a per-panel `weatherByCity` so React
  // re-renders rows as data arrives.
  const [weatherByCity, setWeatherByCity] = useState<Map<string, Weather | null>>(new Map());
  // Stable cache key for the dependency below — strings list of all the
  // resolved cities we'd fetch.
  const cityKey = Array.from(effectiveCityByUserId.values()).filter(Boolean).join("\n");
  useEffect(() => {
    const cities = Array.from(new Set(cityKey.split("\n").filter(Boolean)));
    let cancelled = false;
    cities.forEach(async (city) => {
      const w = await getWeatherForCity(city);
      if (cancelled) return;
      setWeatherByCity((prev) => {
        if (prev.get(city) === w) return prev;
        const next = new Map(prev);
        next.set(city, w);
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [cityKey]);

  const statusById = new Map<string, PresenceStatus>(participants.map((p) => [p.id, p.status]));
  // Owner-first, then me, then alphabetical.
  const sorted = [...members].sort((a, b) => {
    if (a.role !== b.role) return a.role === "owner" ? -1 : 1;
    if (a.userId === meId) return -1;
    if (b.userId === meId) return 1;
    return (a.displayName ?? a.username).localeCompare(b.displayName ?? b.username);
  });

  return (
    <section
      aria-label="Space members"
      className="border border-white/[0.06] bg-bg-elevated/25 backdrop-blur-sm"
    >
      <header className="flex items-baseline justify-between border-b border-white/[0.06] px-4 py-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-white/45">Members</span>
        <span className="font-mono text-[11px] tabular-nums text-white/55">{members.length}</span>
      </header>
      <ul>
        {sorted.map((m) => {
          const status = statusById.get(m.userId) ?? "offline";
          const isMe = m.userId === meId;
          const name = m.displayName ?? `@${m.username}`;
          const city = effectiveCityByUserId.get(m.userId) ?? null;
          const cityIsDerived = city !== null && m.city == null;
          const weather = city ? weatherByCity.get(city) ?? undefined : undefined;
          return (
            <li
              key={m.userId}
              className="flex items-center gap-3 border-b border-white/[0.04] px-4 py-3 last:border-b-0"
            >
              <span className="relative inline-flex h-7 w-7 shrink-0 items-center justify-center border border-accent/30 bg-accent/10 text-accent">
                {m.role === "owner" ? <Crown className="h-3.5 w-3.5" /> : <User className="h-3.5 w-3.5" />}
                <span
                  className={cn(
                    "absolute -right-1 -top-1 h-2 w-2 rounded-full border border-black/70",
                    status === "watching" ? "bg-emerald-400 shadow-[0_0_6px_rgb(52_211_153/0.6)]" : status === "online" ? "bg-cyan-400" : "bg-white/20",
                  )}
                  aria-hidden
                />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm text-foreground">{name}</span>
                  {isMe && <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-dim">you</span>}
                </div>
                <div className="flex items-center gap-2 font-mono text-[11px] text-text-dim">
                  {m.timezone ? (
                    <span title={m.timezone}>{formatLocalTime(m.timezone)}</span>
                  ) : (
                    <span title="No timezone set yet">{m.role}</span>
                  )}
                  {m.timezone && city && <span className="text-text-dim/60">·</span>}
                  {city && (
                    <span
                      className="max-w-[12ch] truncate"
                      title={cityIsDerived ? `${city} — derived from timezone (${m.timezone})` : city}
                    >
                      {city}
                    </span>
                  )}
                </div>
              </div>
              <WeatherChip weather={weather} hasCity={Boolean(city)} />
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// HH:MM in the member's local time zone. Returns "—" if the IANA tz
// doesn't resolve — Intl throws on a bad name, we never want to crash
// the panel for one bad row.
function formatLocalTime(timezone: string): string {
  try {
    return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", timeZone: timezone });
  } catch {
    return "—";
  }
}

// undefined → still loading / no city; null → fetch failed.
function WeatherChip({ weather, hasCity }: { weather: Weather | null | undefined; hasCity: boolean }) {
  if (!hasCity) return <span className="font-mono text-[11px] tabular-nums text-text-dim/40">—</span>;
  if (weather === undefined) {
    return <span className="h-3 w-10 animate-pulse rounded-sm bg-white/[0.05]" aria-hidden />;
  }
  if (weather === null) return <span className="font-mono text-[11px] tabular-nums text-text-dim/40">—</span>;
  const { bucket, label } = weatherBucket(weather.code);
  const Icon = iconFor(bucket);
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 font-mono text-[11px] tabular-nums text-foreground/80"
      title={`${label} · ${weather.resolvedName}`}
    >
      <Icon className="h-3.5 w-3.5 text-text-dim" />
      {Math.round(weather.tempC)}°
    </span>
  );
}

function iconFor(bucket: ReturnType<typeof weatherBucket>["bucket"]) {
  switch (bucket) {
    case "clear":
      return Sun;
    case "partly":
      return CloudSun;
    case "fog":
      return CloudFog;
    case "drizzle":
      return CloudDrizzle;
    case "rain":
      return CloudRain;
    case "snow":
      return Snowflake;
    case "thunder":
      return CloudLightning;
    default:
      return Cloud;
  }
}
