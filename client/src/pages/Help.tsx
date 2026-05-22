import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle2, HelpCircle, Server, Video, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export default function Help() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-7 px-4 py-6 sm:px-6 sm:py-8">
      <header className="flex flex-col leading-tight border-b border-border pb-5">
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Help</span>
        <h1 className="flex items-center gap-2 text-base font-semibold tracking-tight text-foreground">
          <HelpCircle className="h-4 w-4 text-accent" />
          Hosting your video
        </h1>
      </header>

      <Section label="What you need">
        <p className="text-base leading-[1.7] text-foreground/90">
          A <span className="font-medium text-foreground">direct video URL</span> — a link that anyone can paste into their browser and have the video itself play (or download),
          with no website around it.
        </p>
        <p className="text-sm leading-[1.7] text-muted-foreground">
          Roomflix never stores the video. Each viewer's browser fetches it from the URL you provide, so the file just needs to live somewhere reachable on the internet.
        </p>
      </Section>

      <Section label={`What's a "direct link"?`}>
        <p className="text-sm leading-[1.7] text-muted-foreground">
          Think of a direct link like the URL to a downloadable PDF — paste it into the address bar and the file itself opens. A YouTube link is the URL to a{" "}
          <em className="font-serif-em text-foreground/80">page</em> about a video; the file is in there, but it's wrapped in a website.
        </p>

        <div className="border border-border bg-white/[0.02] p-4">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan">Quick test</div>
          <p className="mt-1.5 text-sm leading-[1.7] text-foreground/90">
            Open the URL in a fresh browser tab. If the browser starts playing the video or downloads the file, it's direct. If you see a website (logo, controls, suggestions), it
            isn't.
          </p>
        </div>

        <div className="grid gap-2 pt-1">
          <ExampleRow kind="ok" url="https://cdn.example.com/talk.mp4" note="Direct — points at the file" />
          <ExampleRow kind="bad" url="https://youtube.com/watch?v=…" note="YouTube page with a player around the video" />
          <ExampleRow kind="bad" url="https://drive.google.com/file/d/…/view" note="Drive viewer page, not the file" />
          <ExampleRow kind="warn" url="https://drive.google.com/uc?export=download&id=…" note="Sort-of-direct, but Drive's interstitial breaks files >100 MB" />
        </div>

        <p className="pt-1 text-xs leading-[1.7] text-muted-foreground">
          <strong className="font-medium text-foreground/85">Why YouTube doesn't work:</strong> YouTube serves the actual video bytes from rotating signed URLs that expire and
          aren't meant for embedding. There's no stable direct link to extract — you'd need to host the file somewhere you control.
        </p>
      </Section>

      <Section label="What can I host?">
        <p className="text-sm leading-[1.7] text-muted-foreground">
          Anything your browser can play — typically <Code>.mp4</Code>, <Code>.webm</Code>, and (sometimes) <Code>.mkv</Code>. People typically share things like:
        </p>
        <ul className="grid gap-1.5 pt-1 text-sm text-foreground/90 sm:grid-cols-2">
          <Bullet>Home videos and family memories</Bullet>
          <Bullet>Recorded talks, lectures, or workshops</Bullet>
          <Bullet>Wedding or event highlights</Bullet>
          <Bullet>Your own creative work — short films, tutorials</Bullet>
          <Bullet>Conference recordings (with permission)</Bullet>
          <Bullet>Public-domain content from Internet Archive</Bullet>
        </ul>
        <p className="pt-2 text-xs leading-[1.7] text-muted-foreground">
          You control where the file lives and who can reach it. Roomflix just plays whatever URL you point it at — and only the people you share the room link with ever see the
          video.
        </p>
      </Section>

      <Section
        label={
          <span className="flex items-center gap-1.5">
            <Server className="h-3 w-3" />
            Where to host it
          </span>
        }
      >
        <p className="text-sm leading-[1.7] text-muted-foreground">Anything that serves your video over a direct URL will work. A few popular places people start with:</p>
        <div className="grid gap-2 pt-1">
          <HostOption name="Cloudflare R2" tag="recommended" hint="10 GB free, no bandwidth fees, fast worldwide. S3-compatible API. Custom domain optional." />
          <HostOption name="Backblaze B2" hint="10 GB free, S3-compatible. Cheap egress beyond the free tier." />
          <HostOption name="Self-hosted (VPS + nginx or Caddy)" hint="Full control, costs whatever your VPS does. Make sure to enable byte-range requests for seeking." />
          <HostOption name="Internet Archive" hint="For public-domain content or your own creative work you want to keep public forever." />
        </div>
        <p className="pt-1 text-xs leading-[1.7] text-muted-foreground">
          …and plenty of others — AWS S3, DigitalOcean Spaces, Wasabi, iDrive E2, MinIO, GitHub Releases for small files, an old Raspberry Pi at home, your university web space. If
          it can serve a video file over HTTPS with byte-range requests, it'll play.
        </p>
      </Section>

      <Section
        label={
          <span className="flex items-center gap-1.5 text-amber-300">
            <AlertTriangle className="h-3 w-3" />A few gotchas
          </span>
        }
        framed
      >
        <ul className="space-y-3 text-sm leading-[1.7] text-foreground/90">
          <li>
            <strong className="font-medium text-foreground">Format:</strong> <Code>.mp4</Code> with H.264 + AAC plays in every browser. <Code>.mkv</Code> with x265/HEVC is
            hit-and-miss — Safari handles it, Chrome often can't.
          </li>
          <li>
            <strong className="font-medium text-foreground">File size:</strong> No hard limit, but huge files start slower. CDNs handle this best.
          </li>
          <li>
            <strong className="font-medium text-foreground">Range requests:</strong> Needed for seeking through the timeline. CDNs and most file servers support them out of the
            box; some toy hosts don't.
          </li>
        </ul>
      </Section>

      <footer className="border-t border-border pt-6 text-center text-xs text-text-dim">
        <Link to="/library" className="inline-flex items-center gap-1.5 transition hover:text-foreground">
          <Video className="h-3 w-3" />
          Got a URL? Add it to your library
        </Link>
      </footer>
    </main>
  );
}

// A bordered content block titled by a coral section label. `framed` swaps
// the label color to amber for warning sections.
function Section({ label, children, framed }: { label: React.ReactNode; children: React.ReactNode; framed?: boolean }) {
  return (
    <section className={cn("flex flex-col gap-3 border border-border bg-bg-elevated/40 p-6", framed && "border-amber-300/20 bg-amber-300/[0.03]")}>
      <div className="section-label">{label}</div>
      {children}
    </section>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return <code className="border border-border bg-white/[0.04] px-1.5 py-0.5 font-mono text-[12px] text-foreground/90">{children}</code>;
}

function ExampleRow({ kind, url, note }: { kind: "ok" | "bad" | "warn"; url: string; note: string }) {
  const styles =
    kind === "ok" ? { Icon: CheckCircle2, color: "text-live" } : kind === "bad" ? { Icon: XCircle, color: "text-accent" } : { Icon: AlertTriangle, color: "text-amber-300" };
  return (
    <div className="flex items-start gap-2.5 border border-border bg-white/[0.02] px-3 py-2.5">
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
    <div className="border border-border bg-white/[0.02] px-3.5 py-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-foreground">{name}</span>
        {tag && <span className="border border-accent/30 bg-accent/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-accent">{tag}</span>}
      </div>
      <p className="mt-0.5 text-xs leading-[1.7] text-muted-foreground">{hint}</p>
    </div>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <span className="mt-2 h-1 w-1 shrink-0 bg-accent/70" />
      <span>{children}</span>
    </li>
  );
}
