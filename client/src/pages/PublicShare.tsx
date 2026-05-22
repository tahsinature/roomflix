import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Ban, ChevronLeft, ChevronRight, Film, Loader2, Lock, Music } from "lucide-react";
import type { PublicShare as PublicShareData, PublicShareGate, PublicShareItem } from "@shared/protocol";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn, mediaKind, urlFilename } from "@/lib/utils";

// Public, unauthenticated viewer for a /share/:code link. Resolves the
// share through a small gate state machine (unavailable / passcode /
// ready) then renders a lightweight standalone viewer — not the synced
// theater, just the media itself.
export default function PublicShare() {
  const { code = "" } = useParams();
  const [gate, setGate] = useState<PublicShareGate | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let cancelled = false;
    api
      .getPublicShare(code)
      .then((g) => {
        if (!cancelled) setGate(g);
      })
      .catch((e) => {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 404) setNotFound(true);
        else setLoadError((e as Error).message || "Couldn't load this link.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [code]);

  if (loading) {
    return (
      <Frame>
        <Loader2 className="h-7 w-7 animate-spin text-accent/90" />
        <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-white/45">Loading…</span>
      </Frame>
    );
  }
  if (notFound) {
    return (
      <Frame>
        <Ban className="h-8 w-8 text-white/40" />
        <p className="text-sm text-white/70">This share link doesn't exist.</p>
      </Frame>
    );
  }
  if (loadError) {
    return (
      <Frame>
        <Ban className="h-8 w-8 text-accent" />
        <p className="text-sm text-white/70">{loadError}</p>
      </Frame>
    );
  }
  if (gate?.state === "unavailable") {
    const msg =
      gate.reason === "expired" ? "This share link has expired." : gate.reason === "limit" ? "This share link has reached its open limit." : "This share link has been turned off.";
    return (
      <Frame>
        <Ban className="h-8 w-8 text-accent" />
        <p className="text-sm text-white/70">{msg}</p>
      </Frame>
    );
  }
  if (gate?.state === "passcode") {
    return <PasscodeGate code={code} label={gate.label} onResolved={setGate} />;
  }
  if (gate?.state === "ready") {
    return <ShareViewer share={gate.share} />;
  }
  return null;
}

// Centered dark layout for the loading / error / locked states.
function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-[100dvh] flex-col items-center justify-center gap-3 bg-black px-6 text-center">
      {children}
      <span className="mt-2 font-mono text-[10px] uppercase tracking-[0.2em] text-white/30">Roomflix</span>
    </div>
  );
}

function PasscodeGate({ code, label, onResolved }: { code: string; label: string; onResolved: (g: PublicShareGate) => void }) {
  const [passcode, setPasscode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (busy || !passcode.trim()) return;
    setBusy(true);
    setError("");
    try {
      onResolved(await api.unlockPublicShare(code, passcode));
    } catch (e) {
      const status = e instanceof ApiError ? e.status : 0;
      setError(status === 403 ? "Incorrect passcode." : (e as Error).message || "Couldn't unlock this link.");
      setBusy(false);
    }
  };

  return (
    <Frame>
      <span className="flex h-14 w-14 items-center justify-center border border-white/15 bg-white/[0.04] text-white/70">
        <Lock className="h-6 w-6" />
      </span>
      <p className="text-sm font-medium text-white/90">{label || "Passcode required"}</p>
      <p className="-mt-1 text-xs text-white/45">Enter the passcode to view this share.</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="mt-1 flex w-full max-w-xs flex-col gap-2"
      >
        <Input type="password" autoFocus value={passcode} onChange={(e) => setPasscode(e.target.value)} placeholder="Passcode" className="text-center" />
        {error && <div className="text-xs text-accent">{error}</div>}
        <Button type="submit" variant="accent" disabled={busy || !passcode.trim()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
          Unlock
        </Button>
      </form>
    </Frame>
  );
}

function ShareViewer({ share }: { share: PublicShareData }) {
  const [index, setIndex] = useState(0);
  const items = share.items;
  const current = items[Math.min(index, items.length - 1)];
  const isCollection = share.kind === "collection" && items.length > 1;

  const step = useCallback(
    (delta: number) => {
      setIndex((i) => Math.max(0, Math.min(items.length - 1, i + delta)));
    },
    [items.length],
  );

  // ←/→ navigate a multi-item share.
  useEffect(() => {
    if (!isCollection) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") step(1);
      else if (e.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isCollection, step]);

  return (
    <div className="flex h-[100dvh] flex-col bg-black text-white">
      <header className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-2.5">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-white/90">{share.label || share.title}</div>
          <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/40">
            {isCollection ? `Item ${Math.min(index, items.length - 1) + 1} / ${items.length}` : "Shared media"}
          </div>
        </div>
        <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.2em] text-white/30">Roomflix</span>
      </header>

      <main className="relative flex min-h-0 flex-1 items-center justify-center">
        {current ? <MediaItem item={current} /> : <p className="text-sm text-white/50">This share is empty.</p>}
        {isCollection && (
          <>
            <StepButton side="left" disabled={index <= 0} onClick={() => step(-1)} />
            <StepButton side="right" disabled={index >= items.length - 1} onClick={() => step(1)} />
          </>
        )}
      </main>

      {isCollection && (
        <ul className="flex shrink-0 gap-1.5 overflow-x-auto border-t border-white/10 bg-black/80 p-2">
          {items.map((item, i) => (
            <li key={`${item.url}-${i}`} className="shrink-0">
              <button
                type="button"
                onClick={() => setIndex(i)}
                aria-current={i === index}
                className={cn(
                  "relative block h-14 w-14 overflow-hidden border transition",
                  i === index ? "border-accent ring-1 ring-accent" : "border-white/15 opacity-60 hover:opacity-100",
                )}
                title={item.name || urlFilename(item.url)}
              >
                <Thumb item={item} />
                <span className="absolute left-0.5 top-0.5 bg-black/70 px-1 font-mono text-[9px] text-white/80">{i + 1}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Renders a single item by media kind — plain elements, no sync layer.
function MediaItem({ item }: { item: PublicShareItem }) {
  const kind = mediaKind(item.url);
  if (kind === "image") {
    return <img src={item.url} alt={item.name || ""} className="max-h-full max-w-full object-contain" />;
  }
  if (kind === "audio") {
    return (
      <div className="flex w-full max-w-lg flex-col items-center gap-5 px-6">
        <span className="flex h-20 w-20 items-center justify-center border border-white/15 bg-white/[0.04] text-white/60">
          <Music className="h-9 w-9" />
        </span>
        <div className="truncate text-center text-sm text-white/80">{item.name || urlFilename(item.url)}</div>
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <audio key={item.url} src={item.url} controls autoPlay className="w-full" />
      </div>
    );
  }
  return (
    // eslint-disable-next-line jsx-a11y/media-has-caption
    <video key={item.url} src={item.url} controls autoPlay playsInline className="max-h-full max-w-full" />
  );
}

function Thumb({ item }: { item: PublicShareItem }) {
  const kind = mediaKind(item.url);
  if (kind === "image") {
    return <img src={item.url} alt="" loading="lazy" className="h-full w-full object-cover" />;
  }
  return (
    <span className="flex h-full w-full items-center justify-center bg-white/[0.06] text-white/55">
      {kind === "audio" ? <Music className="h-4 w-4" /> : <Film className="h-4 w-4" />}
    </span>
  );
}

function StepButton({ side, disabled, onClick }: { side: "left" | "right"; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={side === "left" ? "Previous" : "Next"}
      className={cn(
        "absolute top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center border border-white/15 bg-black/55 text-white/85 backdrop-blur transition hover:bg-black/75 disabled:opacity-0",
        side === "left" ? "left-3" : "right-3",
      )}
    >
      {side === "left" ? <ChevronLeft className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
    </button>
  );
}
