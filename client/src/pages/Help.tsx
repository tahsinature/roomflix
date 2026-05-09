import { Link } from "react-router-dom";
import { AlertTriangle, ArrowLeft, CheckCircle2, HelpCircle, Server, Video, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export default function Help() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
      <header className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon">
          <Link to="/" aria-label="Back to home">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Help</div>
          <h1 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <HelpCircle className="h-4 w-4 text-violet-300" />
            Hosting your video
          </h1>
        </div>
      </header>

      {/* TL;DR */}
      <Card>
        <CardContent className="space-y-2 p-6 pt-6">
          <SectionLabel>What you need</SectionLabel>
          <p className="text-base leading-relaxed text-foreground/90">
            A <span className="font-medium text-foreground">direct video URL</span> — a link that anyone can paste into their browser and have the video itself play (or download),
            with no website around it.
          </p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Roomflix never stores the video. Each viewer's browser fetches it from the URL you provide, so the file just needs to live somewhere reachable on the internet.
          </p>
        </CardContent>
      </Card>

      {/* Direct link explained */}
      <Card>
        <CardContent className="space-y-4 p-6 pt-6">
          <SectionLabel>What's a "direct link"?</SectionLabel>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Think of a direct link like the URL to a downloadable PDF — paste it into the address bar and the file itself opens. A YouTube link is the URL to a <em>page</em> about
            a video; the file is in there, but it's wrapped in a website.
          </p>

          <div className="rounded-lg border border-white/5 bg-white/[0.02] p-4">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Quick test</div>
            <p className="mt-1 text-sm leading-relaxed text-foreground/85">
              Open the URL in a fresh browser tab. If the browser starts playing the video or downloads the file, it's direct. If you see a website (logo, controls, suggestions),
              it isn't.
            </p>
          </div>

          <div className="space-y-2 pt-1">
            <ExampleRow kind="ok" url="https://cdn.example.com/talk.mp4" note="Direct — points at the file" />
            <ExampleRow kind="bad" url="https://youtube.com/watch?v=…" note="YouTube page with a player around the video" />
            <ExampleRow kind="bad" url="https://drive.google.com/file/d/…/view" note="Drive viewer page, not the file" />
            <ExampleRow kind="warn" url="https://drive.google.com/uc?export=download&id=…" note="Sort-of-direct, but Drive's interstitial breaks files >100 MB" />
          </div>

          <p className="pt-1 text-xs leading-relaxed text-muted-foreground">
            <strong className="font-medium text-foreground/80">Why YouTube doesn't work:</strong> YouTube serves the actual video bytes from rotating signed URLs that expire and
            aren't meant for embedding. There's no stable direct link to extract — you'd need to host the file somewhere you control.
          </p>
        </CardContent>
      </Card>

      {/* What kinds of videos */}
      <Card>
        <CardContent className="space-y-3 p-6 pt-6">
          <SectionLabel>What can I host?</SectionLabel>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Anything your browser can play — typically <code className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-xs">.mp4</code>,{" "}
            <code className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-xs">.webm</code>, and (sometimes){" "}
            <code className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-xs">.mkv</code>. People typically share things like:
          </p>
          <ul className="grid gap-1.5 pt-1 text-sm text-foreground/85 sm:grid-cols-2">
            <Bullet>Home videos and family memories</Bullet>
            <Bullet>Recorded talks, lectures, or workshops</Bullet>
            <Bullet>Wedding or event highlights</Bullet>
            <Bullet>Your own creative work — short films, tutorials</Bullet>
            <Bullet>Conference recordings (with permission)</Bullet>
            <Bullet>Public-domain content from Internet Archive</Bullet>
          </ul>
          <p className="pt-2 text-xs leading-relaxed text-muted-foreground">
            You control where the file lives and who can reach it. Roomflix just plays whatever URL you point it at — and only the people you share the room link with ever see the
            video.
          </p>
        </CardContent>
      </Card>

      {/* Where to host */}
      <Card>
        <CardContent className="space-y-3 p-6 pt-6">
          <SectionLabel>
            <Server className="h-3 w-3" />
            Where to host it
          </SectionLabel>
          <p className="text-sm leading-relaxed text-muted-foreground">Anything that serves your video over a direct URL will work. A few popular places people start with:</p>
          <div className="grid gap-2 pt-1">
            <HostOption name="Cloudflare R2" tag="recommended" hint="10 GB free, no bandwidth fees, fast worldwide. S3-compatible API. Custom domain optional." />
            <HostOption name="Backblaze B2" hint="10 GB free, S3-compatible. Cheap egress beyond the free tier." />
            <HostOption name="Self-hosted (VPS + nginx or Caddy)" hint="Full control, costs whatever your VPS does. Make sure to enable byte-range requests for seeking." />
            <HostOption name="Internet Archive" hint="For public-domain content or your own creative work you want to keep public forever." />
          </div>
          <p className="pt-1 text-xs leading-relaxed text-muted-foreground">
            …and plenty of others — AWS S3, DigitalOcean Spaces, Wasabi, iDrive E2, MinIO, GitHub Releases for small files, an old Raspberry Pi at home, your university web space.
            If it can serve a video file over HTTPS with byte-range requests, it'll play.
          </p>
        </CardContent>
      </Card>

      {/* Gotchas */}
      <Card className="border-amber-400/20">
        <CardContent className="space-y-2 p-6 pt-6">
          <SectionLabel>
            <AlertTriangle className="h-3 w-3 text-amber-300/80" />A few gotchas
          </SectionLabel>
          <ul className="space-y-2 text-sm text-foreground/85">
            <li>
              <strong className="font-medium text-foreground">Format:</strong> <code className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-xs">.mp4</code> with H.264 + AAC
              plays in every browser. <code className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-xs">.mkv</code> with x265/HEVC is hit-and-miss — Safari handles it, Chrome
              often can't.
            </li>
            <li>
              <strong className="font-medium text-foreground">File size:</strong> No hard limit, but huge files start slower. CDNs handle this best.
            </li>
            <li>
              <strong className="font-medium text-foreground">Range requests:</strong> Needed for seeking through the timeline. CDNs and most file servers support them out of the
              box; some toy hosts don't.
            </li>
          </ul>
        </CardContent>
      </Card>

      <footer className="pt-2 text-center text-xs text-muted-foreground/70">
        <Link to="/library" className="inline-flex items-center gap-1 transition hover:text-foreground">
          <Video className="h-3 w-3" />
          Got a URL? Add it to your library
        </Link>
      </footer>
    </main>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{children}</div>;
}

function ExampleRow({ kind, url, note }: { kind: "ok" | "bad" | "warn"; url: string; note: string }) {
  const styles =
    kind === "ok"
      ? { Icon: CheckCircle2, color: "text-emerald-400" }
      : kind === "bad"
        ? { Icon: XCircle, color: "text-red-400" }
        : { Icon: AlertTriangle, color: "text-amber-300" };
  return (
    <div className="flex items-start gap-2 rounded-md border border-white/5 bg-white/[0.02] px-3 py-2">
      <styles.Icon className={cn("mt-0.5 h-4 w-4 shrink-0", styles.color)} />
      <div className="min-w-0 flex-1">
        <div className="truncate font-mono text-xs text-foreground/90">{url}</div>
        <div className="text-[11px] text-muted-foreground">{note}</div>
      </div>
    </div>
  );
}

function HostOption({ name, hint, tag }: { name: string; hint: string; tag?: string }) {
  return (
    <div className="rounded-md border border-white/5 bg-white/[0.02] px-3 py-2.5">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-foreground">{name}</span>
        {tag && <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-violet-200">{tag}</span>}
      </div>
      <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{hint}</p>
    </div>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-violet-400/70" />
      <span>{children}</span>
    </li>
  );
}
