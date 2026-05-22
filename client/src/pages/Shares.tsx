import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Ban, Check, ChevronDown, Clock, Copy, Layers, Link2, Loader2, Play, QrCode, Trash2 } from "lucide-react";
import type { ShareAccess, ShareLink } from "@shared/protocol";
import { api, ApiError } from "@/lib/api";
import { useToast } from "@/components/Toast";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ShareStatus = "active" | "disabled" | "expired" | "limit";

function shareStatus(link: ShareLink): ShareStatus {
  if (link.disabled) return "disabled";
  if (link.expiresAt !== null && link.expiresAt < Date.now()) return "expired";
  if (link.maxAccesses !== null && link.accessCount >= link.maxAccesses) return "limit";
  return "active";
}

const STATUS_TEXT: Record<ShareStatus, string> = {
  active: "Active",
  disabled: "Disabled",
  expired: "Expired",
  limit: "Limit reached",
};

// Share Control — every public share link in the space, with status,
// open counts, the per-link access log, and revoke / enable controls.
export default function Shares() {
  const toast = useToast();
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    api
      .listShares()
      .then((list) => {
        if (!cancelled) setLinks(list);
      })
      .catch((e) => {
        if (!cancelled) setError((e as Error).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
      <header>
        <h1 className="text-lg font-semibold text-foreground">Share control</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Public links to your media and collections. Each can carry a passcode, an expiry, and an open limit — revoke any of them here.
        </p>
      </header>

      {error && <div className="border border-accent/30 bg-accent/10 p-3 text-sm text-accent">{error}</div>}

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading share links…</div>
      ) : links.length === 0 ? (
        <div className="border border-border bg-bg-elevated/40 p-10 text-center">
          <Link2 className="mx-auto h-5 w-5 text-text-dim" />
          <div className="mt-2 text-sm font-medium text-foreground">No share links yet</div>
          <p className="mt-1 font-mono text-[11px] text-text-dim">Use “Share” on a saved media row or a collection in the Library.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {links.map((link) => (
            <ShareRow
              key={link.id}
              link={link}
              onChange={(next) => setLinks((prev) => prev.map((l) => (l.id === next.id ? next : l)))}
              onRemove={() => setLinks((prev) => prev.filter((l) => l.id !== link.id))}
              onError={(msg) => toast.error(msg)}
            />
          ))}
        </ul>
      )}
    </main>
  );
}

function ShareRow({ link, onChange, onRemove, onError }: { link: ShareLink; onChange: (next: ShareLink) => void; onRemove: () => void; onError: (msg: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [armedDelete, setArmedDelete] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [accesses, setAccesses] = useState<ShareAccess[] | null>(null);
  const [loadingLog, setLoadingLog] = useState(false);

  useEffect(() => {
    if (!armedDelete) return;
    const t = setTimeout(() => setArmedDelete(false), 3000);
    return () => clearTimeout(t);
  }, [armedDelete]);

  const status = shareStatus(link);
  const url = `${window.location.origin}/share/${link.id}`;

  const fail = (e: unknown) => {
    const s = e instanceof ApiError ? e.status : 0;
    onError(s === 403 ? "Only the link's creator or the space owner can change it." : `Something went wrong. ${(e as Error).message}`);
  };

  const toggleDisabled = async () => {
    if (busy) return;
    setBusy(true);
    try {
      onChange(await api.updateShare(link.id, { disabled: !link.disabled }));
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (busy) return;
    if (!armedDelete) {
      setArmedDelete(true);
      return;
    }
    setArmedDelete(false);
    setBusy(true);
    try {
      await api.deleteShare(link.id);
      onRemove();
    } catch (e) {
      fail(e);
      setBusy(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  const toggleLog = async () => {
    const next = !logOpen;
    setLogOpen(next);
    if (next && accesses === null) {
      setLoadingLog(true);
      try {
        setAccesses(await api.shareAccesses(link.id));
      } catch (e) {
        onError(`Couldn't load the access log. ${(e as Error).message}`);
        setLogOpen(false);
      } finally {
        setLoadingLog(false);
      }
    }
  };

  const uniqueVisitors = accesses ? new Set(accesses.map((a) => a.ip)).size : null;

  return (
    <li className="border border-border bg-bg-elevated/40">
      <div className="flex flex-col gap-3 p-4">
        {/* Heading row: target + status. */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2.5">
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center border border-border text-text-dim">
              {link.targetKind === "collection" ? <Layers className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            </span>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-foreground">{link.label || link.targetTitle || "Untitled share"}</div>
              <div className="truncate font-mono text-[11px] text-text-dim">
                {link.targetKind === "collection" ? "Collection" : "Media file"}
                {link.targetTitle && link.label !== link.targetTitle ? ` · ${link.targetTitle}` : ""}
              </div>
            </div>
          </div>
          <StatusBadge status={status} />
        </div>

        {/* The link itself. */}
        <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate border border-border bg-background px-2.5 py-1.5 font-mono text-[11px] text-muted-foreground">{url}</code>
          <Button variant="outline" size="icon" onClick={copy} aria-label="Copy link" title="Copy link">
            {copied ? <Check className="h-4 w-4 text-live" /> : <Copy className="h-4 w-4" />}
          </Button>
          <Button variant="outline" size="icon" onClick={() => setShowQr((v) => !v)} aria-label="Show QR code" title="QR code">
            <QrCode className="h-4 w-4" />
          </Button>
        </div>

        {showQr && (
          <div className="flex justify-center py-1">
            <div className="bg-white p-3">
              <QRCodeSVG value={url} size={148} />
            </div>
          </div>
        )}

        {/* Stats line. */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] text-text-dim">
          <span>
            {link.accessCount} open{link.accessCount === 1 ? "" : "s"}
          </span>
          <span>{link.lastAccessedAt ? `last ${relTime(link.lastAccessedAt)}` : "never opened"}</span>
          {link.hasPasscode && <span className="text-amber-300/80">passcode</span>}
          {link.maxAccesses !== null && (
            <span>
              cap {link.accessCount}/{link.maxAccesses}
            </span>
          )}
          {link.expiresAt !== null && (
            <span className={cn(link.expiresAt < Date.now() && "text-accent")}>
              <Clock className="mr-1 inline h-3 w-3" />
              {link.expiresAt < Date.now() ? "expired" : `expires ${relTime(link.expiresAt)}`}
            </span>
          )}
        </div>

        {/* Actions. */}
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <button
            type="button"
            onClick={toggleLog}
            className="inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground transition hover:text-foreground"
          >
            <ChevronDown className={cn("h-3.5 w-3.5 transition", logOpen && "rotate-180")} />
            Access log
          </button>
          <span className="flex-1" />
          <Button variant="outline" size="sm" onClick={toggleDisabled} disabled={busy}>
            {link.disabled ? "Enable" : "Disable"}
          </Button>
          <Button variant={armedDelete ? "accent" : "outline"} size="sm" onClick={remove} disabled={busy} title={armedDelete ? "Click again to confirm" : "Revoke link"}>
            <Trash2 className="h-3.5 w-3.5" />
            {armedDelete ? "Confirm" : "Revoke"}
          </Button>
        </div>
      </div>

      {logOpen && (
        <div className="border-t border-border bg-background/40 p-4">
          {loadingLog ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading…
            </div>
          ) : !accesses || accesses.length === 0 ? (
            <div className="text-xs text-text-dim">No opens recorded yet.</div>
          ) : (
            <>
              <div className="mb-2 font-mono text-[11px] text-text-dim">
                {accesses.length} open{accesses.length === 1 ? "" : "s"} · {uniqueVisitors} unique visitor{uniqueVisitors === 1 ? "" : "s"}
              </div>
              <ul className="flex flex-col">
                {accesses.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 border-b border-border/60 py-1.5 last:border-b-0">
                    <span className="truncate font-mono text-xs text-foreground">{a.ip || "unknown"}</span>
                    <span className="shrink-0 font-mono text-[11px] text-text-dim">
                      {uaBrief(a.userAgent)} · {relTime(a.accessedAt)}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </li>
  );
}

function StatusBadge({ status }: { status: ShareStatus }) {
  const tone =
    status === "active"
      ? "border-live/30 bg-live/10 text-live"
      : status === "disabled"
        ? "border-border bg-bg-elevated text-muted-foreground"
        : "border-accent/30 bg-accent/10 text-accent";
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1 border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider", tone)}>
      {status !== "active" && <Ban className="h-3 w-3" />}
      {STATUS_TEXT[status]}
    </span>
  );
}

// Short relative time, both past ("3h ago") and future ("in 5d").
function relTime(ts: number): string {
  const diff = Date.now() - ts;
  const future = diff < 0;
  const abs = Math.abs(diff);
  const mins = Math.round(abs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return future ? `in ${mins}m` : `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return future ? `in ${hrs}h` : `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return future ? `in ${days}d` : `${days}d ago`;
}

// Coarse browser name from a user-agent string — enough for the log.
function uaBrief(ua: string): string {
  if (/edg/i.test(ua)) return "Edge";
  if (/chrome|crios/i.test(ua)) return "Chrome";
  if (/firefox|fxios/i.test(ua)) return "Firefox";
  if (/safari/i.test(ua)) return "Safari";
  return ua ? "Browser" : "Unknown";
}
