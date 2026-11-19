import { ExternalLink, MapPin, X } from "lucide-react";
import Link from "next/link";
import { MapCanvas, MapViewPills, MapZoomControls } from "@/components/app/HomeMap";
import { KindDot, NewsCard } from "@/components/app/NewsCards";
import { HeroTitle, cn } from "@/components/ui/primitives";
import { FEEDS, type NewsKind } from "@/data/news";
import type { RawParams } from "@/lib/filters";
import { NewsFresh } from "@/components/app/NewsFresh";
import { kvGet } from "@/lib/db";
import { getNews, getNewsPoints, type NewsFilters } from "@/lib/newsQueries";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tech & World News · RadarX" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const HOURS = { "24h": 24, "3d": 72, "7d": 168 } as const;

function Pill({ href, on, children }: { href: string; on: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={on ? "page" : undefined}
      className={cn(
        "flex h-10 shrink-0 items-center gap-2 rounded-full px-5 text-[14px] transition-colors",
        on ? "bg-active text-active-ink" : "border border-line bg-raised hover:bg-chip",
      )}
    >
      {children}
    </Link>
  );
}

export default async function NewsPage({ searchParams }: { searchParams: Promise<RawParams> }) {
  const sp = await searchParams;
  const kind = (["tech", "world"].includes(one(sp.kind)) ? one(sp.kind) : undefined) as NewsKind | undefined;
  const india = one(sp.india) === "1";
  const topic = one(sp.topic) || undefined;
  const place = one(sp.place) || undefined;
  const search = one(sp.q).trim().slice(0, 60) || undefined;
  const sort = one(sp.sort) === "latest" ? "latest" : "top";
  const within = (one(sp.within) in HOURS ? one(sp.within) : "3d") as keyof typeof HOURS;
  const f: NewsFilters = { kind, india, topic, place, q: search, sort, hours: HOURS[within] };

  const [news, points, checkedAt] = await Promise.all([getNews(f, 60), getNewsPoints(HOURS[within], { kind, india, topic }), kvGet<number>("news_checked_at")]);

  /** Same page with some params changed ("" removes one). */
  const href = (patch: Record<string, string>) => {
    const cur: Record<string, string> = { kind: kind ?? "", india: india ? "1" : "", topic: topic ?? "", place: place ?? "", q: search ?? "", sort: sort === "top" ? "" : sort, within: within === "3d" ? "" : within };
    const q = new URLSearchParams(Object.entries({ ...cur, ...patch }).filter(([, v]) => v));
    return `/news${q.size ? `?${q}` : ""}`;
  };
  const tab = india ? "india" : kind ?? "all";
  const placed = points.reduce((n, p) => n + p.count, 0);

  return (
    <>
      <header className="mt-10 grid gap-6 lg:mt-14 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <HeroTitle light="Tech &" strong="World news" />
          <NewsFresh checkedAt={checkedAt} className="mt-4" />
        </div>
        <p className="max-w-md text-[14px] font-light text-ink-2">
          {FEEDS.length} public feeds — TechCrunch, The Verge, Hacker News, BBC, Al Jazeera, The Hindu, ET Tech and more. Stories several outlets carry rank first; each one is placed on the map where it happens.
        </p>
      </header>

      <section className="card relative mt-8 h-[340px] overflow-hidden !p-0 md:h-[440px]">
        <MapCanvas points={[]} news={points} view="world" panelInset={0} />
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-wrap items-start justify-between gap-3 p-5">
          <div className="pointer-events-auto">
            <MapViewPills withLayers={false} />
          </div>
          <span className="glass num flex items-center gap-3 !rounded-full px-4 py-2 text-[12px] text-ink-2">
            <span className="flex items-center gap-1.5"><KindDot kind="tech" /> Tech</span>
            <span className="flex items-center gap-1.5"><KindDot kind="world" /> World</span>
            <span>{placed} placed · {points.length} places</span>
          </span>
        </div>
        <MapZoomControls className="absolute bottom-5 left-5 z-10" />
      </section>

      <nav className="no-scrollbar -mx-4 mt-6 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0" aria-label="News sections">
        <Pill href={href({ kind: "", india: "", topic: "" })} on={tab === "all"}>All</Pill>
        <Pill href={href({ kind: "tech", india: "", topic: "" })} on={tab === "tech"}><KindDot kind="tech" /> Tech</Pill>
        <Pill href={href({ kind: "world", india: "", topic: "" })} on={tab === "world"}><KindDot kind="world" /> World affairs</Pill>
        <Pill href={href({ kind: "", india: "1", topic: "" })} on={tab === "india"}>India</Pill>
        <span className="mx-1 hidden w-px self-stretch bg-line md:block" />
        {(["24h", "3d", "7d"] as const).map((w) => (
          <Pill key={w} href={href({ within: w === "3d" ? "" : w })} on={within === w}>{w}</Pill>
        ))}
        <span className="mx-1 hidden w-px self-stretch bg-line md:block" />
        <Pill href={href({ sort: "" })} on={sort === "top"}>Top stories</Pill>
        <Pill href={href({ sort: "latest" })} on={sort === "latest"}>Latest</Pill>
      </nav>

      <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0">
        {search && (
          <Link href={href({ q: "" })} className="flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-active px-4 text-[13px] text-active-ink">
            “{search}” <X size={13} />
          </Link>
        )}
        {place && (
          <Link href={href({ place: "" })} className="flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-active px-4 text-[13px] text-active-ink">
            <MapPin size={13} /> {place} <X size={13} />
          </Link>
        )}
        {news.topics.slice(0, 12).map((t) => (
          <Link
            key={t.id}
            href={href({ topic: topic === t.id ? "" : t.id })}
            className={cn("flex h-9 shrink-0 items-center gap-1.5 rounded-full px-4 text-[13px]", topic === t.id ? "bg-active text-active-ink" : "bg-chip text-ink-2 hover:text-ink")}
          >
            {t.label} <span className="num text-ink-3">{t.n}</span>
          </Link>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {news.items.map((n) => (
          <NewsCard key={n.id} n={n} />
        ))}
      </div>
      {!news.items.length && (
        <div className="card p-10 text-center text-ink-2">
          No stories match. {place || topic || search ? <Link href={href({ place: "", topic: "", q: "" })} className="underline">Clear filters</Link> : <>Run <code>npm run worker -- --news</code> to fetch headlines.</>}
        </div>
      )}
      <p className="mt-8 flex items-center gap-1.5 text-[13px] text-ink-3">
        <ExternalLink size={13} />
        Showing {news.items.length} of {news.total} stories. Headlines and short summaries come from each outlet&apos;s public RSS feed; cards open the original article.
      </p>
    </>
  );
}
