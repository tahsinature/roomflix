import { useEffect, useState } from "react";
import { Circle, Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSun, Pause, Play, Settings, Snowflake, Sun } from "lucide-react";
import { Link } from "react-router-dom";
import type { Participant, PresenceStatus, SessionState, SpaceMember } from "@shared/protocol";
import type { MemberDetailKey } from "@/components/MemberDetailModal";
import { MemberRow } from "@/components/MemberRow";
import { cityFromTimezone, getWeatherForCity, weatherBucket, type Weather } from "@/lib/weather";
import { cn, urlFilename } from "@/lib/utils";

type MemberListRow = {
  id: string;
  name: string;
  username?: string | null;
  role: "owner" | "member" | "guest";
  isOwner: boolean;
  isMe: boolean;
  status: PresenceStatus | "offline";
  tone: "member" | "guest";
  timezone: string | null;
  city: string | null;
  memberJoinedAt?: number;
};

export function SpaceMembersPopover({
  align,
  spaceName,
  canManage,
  members,
  participants,
  state,
  meId,
  onClose,
  onSelectMember,
}: {
  align: "left" | "right";
  spaceName: string;
  canManage: boolean;
  members: SpaceMember[];
  participants: Participant[];
  state: SessionState | null;
  meId: string | null;
  onClose: () => void;
  onSelectMember: (detail: MemberDetailKey) => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [weatherByCity, setWeatherByCity] = useState<Map<string, Weather | null>>(() => new Map());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const statusById = new Map<string, PresenceStatus>(participants.map((participant) => [participant.id, participant.status]));
  const memberIds = new Set(members.map((member) => member.userId));
  const cityByMemberId = new Map<string, string | null>();
  for (const member of members) cityByMemberId.set(member.userId, member.city ?? cityFromTimezone(member.timezone));

  const cityKey = Array.from(new Set(Array.from(cityByMemberId.values()).filter((city): city is string => Boolean(city))))
    .sort()
    .join("\n");

  useEffect(() => {
    if (!cityKey) return;
    let cancelled = false;
    const cities = cityKey.split("\n");
    void Promise.all(cities.map(async (city) => [city, await getWeatherForCity(city)] as const)).then((entries) => {
      if (!cancelled) setWeatherByCity(new Map(entries));
    });
    return () => {
      cancelled = true;
    };
  }, [cityKey]);

  const memberRows: MemberListRow[] = members.map((member) => ({
    id: member.userId,
    name: member.displayName?.trim() || `@${member.username}`,
    username: member.username,
    role: member.role,
    isOwner: member.role === "owner",
    isMe: member.userId === meId,
    status: statusById.get(member.userId) ?? "offline",
    tone: "member",
    timezone: member.timezone ?? null,
    city: cityByMemberId.get(member.userId) ?? null,
    memberJoinedAt: member.joinedAt,
  }));
  const guestRows: MemberListRow[] = participants
    .filter((participant) => participant.kind === "guest" || !memberIds.has(participant.id))
    .map((participant) => ({
      id: participant.id,
      name: participant.displayName,
      role: "guest",
      isOwner: false,
      isMe: participant.id === meId,
      status: participant.status,
      tone: "guest",
      timezone: null,
      city: null,
    }));
  const rows = [...memberRows, ...guestRows].sort(compareRows);
  const onlineCount = participants.length;
  const watchingCount = participants.reduce((count, participant) => count + (participant.status === "watching" ? 1 : 0), 0);
  const showTheater = Boolean(state?.videoUrl && watchingCount > 0);
  const playing = Boolean(state?.playing);

  return (
    <div
      role="dialog"
      aria-label={`Members of ${spaceName}`}
      className={cn(
        "absolute top-10 z-40 w-[24rem] max-w-[calc(100vw-2rem)] border border-border bg-bg-elevated/95 shadow-[0_18px_48px_-18px_rgba(0,0,0,0.85)] backdrop-blur-xl",
        align === "right" ? "right-0" : "left-0",
      )}
    >
      <header className="flex items-start justify-between gap-4 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-white/45">Space members</div>
          <div className="mt-1 truncate text-sm text-foreground">{spaceName}</div>
          <div className="mt-1 font-mono text-[10px] text-text-dim">
            {onlineCount} online <span className="text-white/15">·</span> {rows.length} total
          </div>
        </div>
        {canManage ? (
          <Link
            to="/settings/space"
            onClick={onClose}
            className="inline-flex shrink-0 items-center gap-1.5 border border-border px-2 py-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-text-dim transition hover:border-border-hover hover:text-foreground"
          >
            <Settings className="h-3 w-3" /> Manage
          </Link>
        ) : null}
      </header>

      {showTheater && state?.videoUrl ? <NowPlayingLink state={state} playing={playing} watchingCount={watchingCount} onClose={onClose} /> : null}

      {rows.length > 0 ? (
        <ul className="max-h-[min(28rem,calc(100dvh-11rem))] overflow-y-auto py-1">
          {rows.map((row) => {
            const weather = row.city ? weatherByCity.get(row.city) : undefined;
            return (
              <MemberRow
                key={row.id}
                name={row.name}
                subtitle={<LocalContext role={row.role} timezone={row.timezone} city={row.city} now={now} />}
                isOwner={row.isOwner}
                isMe={row.isMe}
                tone={row.tone}
                title="See member details"
                rightSlot={
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <WeatherChip weather={weather} hasCity={Boolean(row.city)} />
                    <PresenceLabel status={row.status} playing={playing} />
                  </div>
                }
                onClick={() =>
                  onSelectMember({
                    identityId: row.id,
                    role: row.role,
                    name: row.name,
                    username: row.username,
                    isMe: row.isMe,
                    memberJoinedAt: row.memberJoinedAt,
                  })
                }
              />
            );
          })}
        </ul>
      ) : (
        <p className="px-4 py-8 text-center text-xs text-muted-foreground">No members are available in this space yet.</p>
      )}
    </div>
  );
}

function compareRows(a: MemberListRow, b: MemberListRow): number {
  const statusDifference = statusRank(a.status) - statusRank(b.status);
  if (statusDifference !== 0) return statusDifference;
  if (a.isOwner !== b.isOwner) return a.isOwner ? -1 : 1;
  if (a.tone !== b.tone) return a.tone === "member" ? -1 : 1;
  return a.name.localeCompare(b.name);
}

function statusRank(status: PresenceStatus | "offline"): number {
  if (status === "watching") return 0;
  if (status === "online") return 1;
  return 2;
}

function NowPlayingLink({ state, playing, watchingCount, onClose }: { state: SessionState; playing: boolean; watchingCount: number; onClose: () => void }) {
  const title = state.videoTitle || urlFilename(state.videoUrl ?? "") || "Untitled media";
  return (
    <Link to="/watch" onClick={onClose} className="flex items-center gap-3 border-b border-accent/25 bg-accent/[0.08] px-4 py-3 transition hover:bg-accent/[0.13]">
      <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center border border-accent/40 bg-accent/15 text-accent">
        {playing ? <PlayingBars /> : <Play className="h-3 w-3 fill-current" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-foreground" title={title}>
          {title}
        </span>
        <span className="mt-0.5 block font-mono text-[9px] uppercase tracking-[0.16em] text-text-dim">
          {playing ? "Playing" : "Paused"} · {watchingCount} in theater
        </span>
      </span>
      <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-accent">Open →</span>
    </Link>
  );
}

function LocalContext({ role, timezone, city, now }: { role: MemberListRow["role"]; timezone: string | null; city: string | null; now: number }) {
  if (role === "guest") return <span className="uppercase tracking-[0.14em]">guest</span>;
  if (!timezone && !city) return <span className="uppercase tracking-[0.14em]">{role}</span>;
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      {timezone ? <span title={timezone}>{formatLocalTime(timezone, now)}</span> : null}
      {timezone && city ? <span className="text-white/20">·</span> : null}
      {city ? <span className="max-w-[13ch] truncate">{city}</span> : null}
    </span>
  );
}

function formatLocalTime(timezone: string, now: number): string {
  try {
    return new Date(now).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", timeZone: timezone });
  } catch {
    return "—";
  }
}

function WeatherChip({ weather, hasCity }: { weather: Weather | null | undefined; hasCity: boolean }) {
  if (!hasCity) return <span className="h-4" aria-hidden />;
  if (weather === undefined) return <span className="h-3 w-9 animate-pulse rounded-sm bg-white/[0.05]" aria-hidden />;
  if (weather === null) return <span className="font-mono text-[10px] text-text-dim/40">—</span>;
  const { bucket, label } = weatherBucket(weather.code);
  const Icon = weatherIcon(bucket);
  return (
    <span className="inline-flex items-center gap-1 font-mono text-[10px] tabular-nums text-foreground/75" title={`${label} · ${weather.resolvedName}`}>
      <Icon className="h-3 w-3 text-text-dim" />
      {Math.round(weather.tempC)}°
    </span>
  );
}

function PresenceLabel({ status, playing }: { status: PresenceStatus | "offline"; playing: boolean }) {
  if (status === "watching") {
    return (
      <span className="inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.12em] text-emerald-300">
        {playing ? <Play className="h-2.5 w-2.5 fill-current" /> : <Pause className="h-2.5 w-2.5 fill-current" />}
        {playing ? "Watching" : "Joined"}
      </span>
    );
  }
  if (status === "online") {
    return (
      <span className="inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.12em] text-cyan-300">
        <Circle className="h-2 w-2 fill-current" /> Online
      </span>
    );
  }
  return <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-text-dim/60">Offline</span>;
}

function PlayingBars() {
  return (
    <span className="inline-flex h-3 w-3 items-end justify-center gap-[1.5px]" aria-hidden>
      <span className="eq-bar h-full w-[2px]" />
      <span className="eq-bar h-full w-[2px]" />
      <span className="eq-bar h-full w-[2px]" />
    </span>
  );
}

function weatherIcon(bucket: ReturnType<typeof weatherBucket>["bucket"]) {
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
