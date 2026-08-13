import { useState } from "react";
import { Check, ChevronDown, Copy, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { recommendedCorsForOrigin } from "@/lib/buckets/cors";
import type { ProviderId } from "@/lib/buckets/types";

// Shown when a request fails with a CORS-shaped error. Browser-direct R2 and
// S3 access both require a per-bucket rule; we provide the correct dashboard
// path and a ready-to-paste policy document.
export function CorsHint({ provider, origin }: { provider: ProviderId; origin?: string }) {
  const [expanded, setExpanded] = useState(true);
  const [copied, setCopied] = useState(false);
  const safeOrigin = origin ?? (typeof window !== "undefined" ? window.location.origin : "https://your-site.example");
  const json = recommendedCorsForOrigin(safeOrigin);
  const isAws = provider === "s3";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — user can still select the textarea contents */
    }
  };

  return (
    <div className="border border-amber-300/30 bg-amber-300/[0.06] p-4 text-xs text-amber-100">
      <button type="button" onClick={() => setExpanded((v) => !v)} className="flex w-full items-center gap-2 text-left">
        <ShieldAlert className="h-4 w-4 shrink-0 text-amber-300" />
        <div className="min-w-0 flex-1">
          <div className="font-medium text-amber-200">Connection blocked — your bucket needs CORS</div>
          <div className="text-amber-100/70">{isAws ? "S3" : "R2"} requires a CORS rule that allows this site to talk to your bucket. One-time setup per bucket.</div>
        </div>
        <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 transition-transform", expanded && "rotate-180")} />
      </button>

      {expanded && (
        <div className="mt-3 space-y-2.5">
          <ol className="list-decimal space-y-1 pl-5 text-amber-100/80">
            <li>
              {isAws ? (
                <>
                  Open the AWS console → S3 → your bucket → <span className="font-mono">Permissions</span> → <span className="font-mono">CORS</span>.
                </>
              ) : (
                <>
                  Open the Cloudflare dashboard → R2 → your bucket → <span className="font-mono">Settings</span> → <span className="font-mono">CORS Policy</span>.
                </>
              )}
            </li>
            <li>Paste the JSON below and save.</li>
            <li>Come back here and click Connect again.</li>
          </ol>

          <div className="relative">
            <pre className="max-h-56 overflow-auto border border-amber-300/20 bg-black/40 p-3 font-mono text-[11px] leading-relaxed text-amber-100/90">{json}</pre>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={copy}
              className="absolute right-2 top-2 h-7 border-amber-300/30 bg-black/40 text-amber-100 hover:bg-black/60"
            >
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>

          <p className="text-amber-100/60">
            Origin: <span className="font-mono">{safeOrigin}</span>. If you self-host, replace this with the URL where you serve Roomflix.
          </p>
        </div>
      )}
    </div>
  );
}
