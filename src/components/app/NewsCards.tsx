"use client";
import { safeHttpUrl } from "@/lib/url";
import { ArrowUpRight, ChevronLeft, ChevronRight, MapPin, Newspaper, Pause, Play } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { cn } from "@/components/ui/primitives";
import type { NewsItem } from "@/lib/newsQueries";

/** Publisher image; hides itself if the publisher refuses hotlinking. */
function Thumb({ src, className }: { src: string | null; className?: string }) {
  const [ok, setOk] = useState(!!src);
  if (!src || !ok) {
    return (
      <span className={cn("flex items-center justify-center bg-raised text-ink-3", className)}>
        <Newspaper size={20} />
      </span>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setOk(false)} className={cn("object-cover", className)} />;
}

export const KindDot = ({ kind, className }: { kind: NewsItem["kind"]; className?: string }) => (
  <span aria-hidden className={cn("inline-block size-2 shrink-0 rotate-45 rounded-[1px]", kind === "tech" ? "bg-accent" : "bg-[#b18cff]", className)} />
);

/** `linkPlace` only where Meta isn't already inside the card's <a> (nested links are invalid HTML). */
function Meta({ n, className, linkPlace, small }: { n: NewsItem; className?: string; linkPlace?: boolean; small?: boolean }) {
  return (
    <span className={cn("flex min-w-0 items-center gap-1.5 text-ink-2", small ? "text-[11px]" : "text-[12px]", className)}>
      <CompanyLogo name={n.sourceName} domain={n.domain} size={small ? 14 : 16} />
      <span className="truncate">{n.sourceName}</span>
      <span className="num shrink-0">· {n.agoShort}</span>
      {n.place &&
        (linkPlace ? (
          <Link href={`/news?place=${encodeURIComponent(n.place)}`} className="flex shrink-0 items-center gap-0.5 hover:text-ink">
            · <MapPin size={11} /> <span className="max-w-[110px] truncate">{n.place}</span>
          </Link>
        ) : (
          <span className="flex shrink-0 items-center gap-0.5">
            · <MapPin size={11} /> <span className="max-w-[110px] truncate">{n.place}</span>
          </span>
        ))}
    </span>
  );
}

/** "Covered by 5 outlets" — the signal that this is a main story. */
export function Coverage({ n, className }: { n: NewsItem; className?: string }) {
  if (n.coverage < 2 && !n.points) return null;
  return (
    <span
      title={n.outlets.join(", ")}
      className={cn("num inline-flex h-6 shrink-0 items-center rounded-full px-2 text-[11px]", n.coverage >= 3 ? "bg-warn/15 text-warn" : "bg-chip text-ink-2", className)}
    >
      {n.coverage >= 2 ? `${n.coverage} outlets` : `${n.points} pts`}
    </span>
  );
}

/** Big story at the top of a briefing card. */
export function NewsLead({ n }: { n: NewsItem }) {
  return (
    <a href={safeHttpUrl(n.url) ?? "#"} target="_blank" rel="noreferrer" className="group flex flex-col gap-3">
      <div className="relative aspect-[16/7] overflow-hidden rounded-[14px]">
        <Thumb src={n.image} className="size-full transition-transform duration-500 group-hover:scale-[1.03]" />
        <span className="absolute left-3 top-3 flex gap-1.5">
          {n.topics.slice(0, 2).map((t) => (
            <span key={t.id} className="glass !rounded-full px-2.5 py-1 text-[11px]">{t.label}</span>
          ))}
        </span>
      </div>
      <div className="flex items-start justify-between gap-3">
        <h3 className="line-clamp-2 text-[17px] leading-snug group-hover:underline">{n.title}</h3>
        <Coverage n={n} />
      </div>
      {n.summary && <p className="line-clamp-2 text-[13px] leading-relaxed text-ink-2">{n.summary}</p>}
      <Meta n={n} />
    </a>
  );
}

/** Compact headline row. */
export function NewsRow({ n, thumb = true, dense }: { n: NewsItem; thumb?: boolean; dense?: boolean }) {
  return (
    <a href={safeHttpUrl(n.url) ?? "#"} target="_blank" rel="noreferrer" className={cn("group flex items-center border-t border-line first:border-t-0", dense ? "gap-2 py-1.5" : "gap-3 py-2.5")}>
      {thumb && <Thumb src={n.image} className={cn("shrink-0 rounded-[10px]", dense ? "size-10" : "size-12")} />}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={cn("line-clamp-2 leading-snug group-hover:underline", dense ? "text-[12.5px]" : "text-[14px]")}>{n.title}</span>
        <Meta n={n} small={dense} />
      </span>
      {!dense && <Coverage n={n} />}
    </a>
  );
}

/** Grid card for /news. */
export function NewsCard({ n }: { n: NewsItem }) {
  return (
    <article className="card rx-lift flex min-w-0 flex-col overflow-hidden">
      <a href={safeHttpUrl(n.url) ?? "#"} target="_blank" rel="noreferrer" className="group flex flex-1 flex-col">
        <div className="relative aspect-[16/9] overflow-hidden">
          <Thumb src={n.image} className="size-full transition-transform duration-500 group-hover:scale-[1.03]" />
          <span className="glass absolute left-3 top-3 flex items-center gap-1.5 !rounded-full px-2.5 py-1 text-[11px]">
            <KindDot kind={n.kind} /> {n.kind === "tech" ? "Tech" : "World"}
            {n.india && <span className="text-ink-2">· India</span>}
          </span>
          <ArrowUpRight size={16} className="glass absolute right-3 top-3 box-content !rounded-full p-1.5 opacity-0 transition-opacity group-hover:opacity-100" />
        </div>
        <div className="flex flex-1 flex-col gap-2.5 p-4">
          <h3 className="line-clamp-3 text-[16px] leading-snug group-hover:underline">{n.title}</h3>
          {n.summary && <p className="line-clamp-3 text-[13px] leading-relaxed text-ink-2">{n.summary}</p>}
          <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
            {n.topics.map((t) => (
              <span key={t.id} className="rounded-full bg-chip px-2 py-0.5 text-[11px] text-ink-2">{t.label}</span>
            ))}
            <Coverage n={n} className="ml-auto" />
          </div>
        </div>
      </a>
      <Meta n={n} linkPlace className="border-t border-line px-4 py-3" />
    </article>
  );
}

type Lane = "all" | "tech" | "world" | "india";

/**
 * Today's briefing as one tall card that rotates through the biggest stories (Tech / World / India
 * lanes), with a progress bar, prev/next, pause on hover, and an "Up next" list to jump ahead.
 */
export function BriefingCarousel({ tech, world, india, interval = 9000, className }: { tech: NewsItem[]; world: NewsItem[]; india: NewsItem[]; interval?: number; className?: string }) {
  const [lane, setLane] = useState<Lane>("all");
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hover, setHover] = useState(false);
  // "all" interleaves the three lanes so the card alternates tech / world / India
  const all: NewsItem[] = [];
  for (let k = 0; k < Math.max(tech.length, world.length, india.length); k++)
    for (const n of [tech[k], world[k], india[k]]) if (n && !all.some((x) => x.id === n.id)) all.push(n);
  const items = lane === "all" ? all : lane === "tech" ? tech : lane === "world" ? world : india;
  const running = !paused && !hover && items.length > 1;
  useEffect(() => {
    if (!running) return;
    const t = setTimeout(() => setI((n) => (n + 1) % items.length), interval);
    return () => clearTimeout(t);
  }, [running, i, items.length, interval]);
  if (!items.length) return null;
  const n = items[i % items.length];
  const go = (d: number) => setI((x) => (x + d + items.length) % items.length);
  const next = [1, 2, 3].map((d) => items[(i + d) % items.length]).filter((x, k, a) => x.id !== n.id && a.findIndex((y) => y.id === x.id) === k);

  return (
    <article className={cn("card flex min-w-0 flex-col overflow-hidden", className)} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <div className="flex items-center justify-between gap-2 px-4 pt-4">
        <div className="flex gap-1" role="tablist" aria-label="Briefing lane">
          {(["all", "tech", "world", "india"] as const).map((l) => (
            <button
              key={l}
              type="button"
              role="tab"
              aria-selected={lane === l}
              onClick={() => (setLane(l), setI(0))}
              className={cn("flex h-7 items-center gap-1.5 rounded-full px-3 text-[12px] transition-colors", lane === l ? "bg-active text-active-ink" : "text-ink-2 hover:text-ink")}
            >
              {l === "tech" || l === "world" ? <KindDot kind={l} /> : null}
              {l === "all" ? "Top" : l === "tech" ? "Tech" : l === "world" ? "World" : "India"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <span className="num mr-1 text-[11px] text-ink-3">{(i % items.length) + 1}/{items.length}</span>
          <button type="button" aria-label={paused ? "Play" : "Pause"} onClick={() => setPaused(!paused)} className="flex size-7 items-center justify-center rounded-full text-ink-2 hover:bg-raised hover:text-ink">
            {paused ? <Play size={12} /> : <Pause size={12} />}
          </button>
          <button type="button" aria-label="Previous story" onClick={() => go(-1)} className="flex size-7 items-center justify-center rounded-full text-ink-2 hover:bg-raised hover:text-ink">
            <ChevronLeft size={15} />
          </button>
          <button type="button" aria-label="Next story" onClick={() => go(1)} className="flex size-7 items-center justify-center rounded-full text-ink-2 hover:bg-raised hover:text-ink">
            <ChevronRight size={15} />
          </button>
        </div>
      </div>

      {/* progress for the current story */}
      <div className="mx-4 mt-3 h-[2px] overflow-hidden rounded-full bg-line">
        <span
          key={`${lane}-${i}-${running}`}
          className="block h-full bg-ink/70"
          style={running ? { animation: `rx-progress ${interval}ms linear both` } : { width: 0 }}
        />
      </div>

      <a key={n.id} href={safeHttpUrl(n.url) ?? "#"} target="_blank" rel="noreferrer" className="rx-fade-up group flex min-h-0 flex-1 flex-col gap-3 p-4">
        <div className="relative min-h-[220px] flex-1 overflow-hidden rounded-[14px]">
          <Thumb src={n.image} className="absolute inset-0 size-full transition-transform duration-700 group-hover:scale-[1.03]" />
          <span className="glass absolute left-3 top-3 flex items-center gap-1.5 !rounded-full px-2.5 py-1 text-[11px]">
            <KindDot kind={n.kind} /> {n.kind === "tech" ? "Tech" : "World"}
            {n.india && <span className="text-ink-2">· India</span>}
          </span>
          <span className="absolute bottom-3 left-3 flex flex-wrap gap-1.5">
            {n.topics.map((t) => (
              <span key={t.id} className="glass !rounded-full px-2.5 py-1 text-[11px]">{t.label}</span>
            ))}
          </span>
        </div>
        <div className="flex items-start justify-between gap-3">
          <h3 className="line-clamp-3 text-[19px] leading-snug tracking-[-0.02em] group-hover:underline">{n.title}</h3>
          <Coverage n={n} />
        </div>
        {n.summary && <p className="line-clamp-3 text-[13px] leading-relaxed text-ink-2">{n.summary}</p>}
        <Meta n={n} />
        {n.coverage > 1 && <p className="truncate text-[11px] text-ink-3">Also covered by {n.outlets.filter((o) => o !== n.sourceName.replace(/ · .*$/, "")).join(", ")}</p>}
      </a>

      {next.length > 0 && (
        <div className="border-t border-line px-4 py-2">
          <p className="py-1 text-[11px] text-ink-3">Up next</p>
          {next.map((x) => (
            <button key={x.id} type="button" onClick={() => setI(items.findIndex((y) => y.id === x.id))} className="flex w-full items-center gap-2 py-1.5 text-left">
              <KindDot kind={x.kind} />
              <span className="min-w-0 flex-1 truncate text-[12.5px] hover:underline">{x.title}</span>
              <span className="num shrink-0 text-[11px] text-ink-3">{x.agoShort}</span>
            </button>
          ))}
        </div>
      )}
    </article>
  );
}
