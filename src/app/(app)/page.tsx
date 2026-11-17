import { ChevronRight, ClipboardList, Clock3, Check } from "lucide-react";
import Link from "next/link";
import { telegramConfigured } from "@/alerts/channels";
import { FilterBar } from "@/components/app/FilterBar";
import { HeroSearch } from "@/components/app/HeroSearch";
import { MapCanvas, MapViewPills, MapZoomControls, NewsTicker } from "@/components/app/HomeMap";
import { BriefingCarousel, NewsRow } from "@/components/app/NewsCards";
import { JobsView } from "@/components/app/JobsView";
import { PanelSlot } from "@/components/app/PanelSlot";
import { MiniJobCard, VolumeHistogram } from "@/components/app/widgets";
import { AlertRow } from "@/components/ui/cards";
import { cn } from "@/components/ui/primitives";
import { parseFilters, type RawParams } from "@/lib/filters";
import { getBriefing, getNewsPoints } from "@/lib/newsQueries";
import { getStocks } from "@/lib/stockQueries";
import { StockMini } from "@/components/app/Stocks";
import {
  getAttention,
  getHomeKpis,
  getSkillDemand,
  getJobs,
  getMapPoints,
  getPrograms,
  getSourceCounts,
  getVolumeBuckets,
} from "@/lib/queries";
import { getProfile } from "@/lib/settings";
import { ago } from "@/lib/time";

export const dynamic = "force-dynamic";

/** 2 rows of compact cards in each half (8 cards fill 4 columns) */
const CARD_GRID = "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";


export default async function Home({ searchParams }: { searchParams: Promise<RawParams> }) {
  const sp = await searchParams;
  const profile = await getProfile();
  const hasResume = profile.skills.length > 0;
  const early = ["intern", "newgrad", "research"];
  const f = parseFilters(sp, { within: "7d", sort: hasResume ? "match" : "new", level: early });

  const [rec, topPick, attention, map, india, programs, kpis, skills, stocks, volume, sources, top4, brief, newsPoints] = await Promise.all([
    getJobs(f, { limit: 9 }),
    getJobs({ ...f, within: "24h", sort: hasResume ? "match" : "new" }, { limit: 1 }),
    getAttention(),
    getMapPoints(24),
    getJobs({ region: ["india"], level: early, within: "7d", sort: hasResume ? "match" : "new", tech: true }, { limit: 8 }),
    getPrograms(),
    getHomeKpis(),
    getSkillDemand(6),
    getStocks(),
    getVolumeBuckets(),
    getSourceCounts(),
    getJobs({ level: early, within: "24h", sort: hasResume ? "match" : "new", tech: true }, { limit: 4 }),
    getBriefing(),
    getNewsPoints(48),
  ]);
  const pick = topPick.jobs[0] ?? rec.jobs[0];
  const recommended = pick ? [pick, ...rec.jobs.filter((j) => j.id !== pick.id)].slice(0, 8) : [];
  const telegram = telegramConfigured();
  const closing = programs.filter((v) => v.status.status === "closing");
  const updated = programs.filter((v) => v.recentlyChanged && v.status.status !== "closing");
  const indiaOpen = programs.filter((v) => v.p.india && (v.status.status === "open" || v.status.status === "closing")).length;
  const attentionCount = closing.length + updated.length + attention.failing.length + (attention.matchCount ? 1 : 0);

  /** Floating glass widget (hero). */
  const G = ({ title, href, note, children, className }: { title: string; href?: string; note?: React.ReactNode; children: React.ReactNode; className?: string }) => (
    <section className={cn("glass flex min-w-0 shrink-0 flex-col gap-2.5 p-3.5", className)}>
      <header className="flex items-center justify-between gap-2">
        <h2 className="text-[14px]">
          {title}
          {note && <span className="ml-1.5 text-[12px] text-ink-2">{note}</span>}
        </h2>
        {href && (
          <Link href={href} aria-label={`Open ${title}`} className="text-ink-2 hover:text-ink">
            <ChevronRight size={15} />
          </Link>
        )}
      </header>
      {children}
    </section>
  );

  // the three numbers that decide what to do today: what's new, what fits, what's about to close
  const kpiCells: { v: number | string; label: string; sub: string; href: string; tone?: string }[] = [
    { v: kpis.new24, label: "New roles · 24h", sub: `${kpis.india24} in India`, href: "/feed?within=24h&level=intern,newgrad,research" },
    kpis.hasResume
      ? { v: kpis.strong7 ?? 0, label: "Strong matches", sub: kpis.strong24 ? `≥80% · ${kpis.strong24} today` : "≥80% · last 7d", href: "/for-you", tone: "text-good" }
      : { v: "—", label: "Strong matches", sub: "upload resume", href: "/settings#resume", tone: "text-ink-3" },
    { v: kpis.closing, label: "Closing · 7d", sub: kpis.closing48 ? `${kpis.closing48} within 48h` : "none within 48h", href: "/feed?sort=new&level=intern,newgrad,research", tone: kpis.closing48 ? "text-warn" : undefined },
  ];

  const leftWidgets = (
    <>
      <section className="glass grid shrink-0 grid-cols-3 gap-1 p-1.5">
        {kpiCells.map((k) => (
          <Link key={k.label} href={k.href} className="flex min-w-0 flex-col gap-1 rounded-[12px] px-2.5 py-2 hover:bg-raised/70">
            <span className="truncate text-[11px] text-ink-2">{k.label}</span>
            <span className={cn("num text-[26px] font-light leading-none tracking-[-0.03em]", k.tone)}>{typeof k.v === "number" ? k.v.toLocaleString("en-IN") : k.v}</span>
            <span className="truncate text-[11px] text-ink-3">{k.sub}</span>
          </Link>
        ))}
      </section>

      <G title="Job-market signals" href="/news?kind=tech&topic=funding" note="48h">
        <div className="grid grid-cols-3 gap-1.5">
          {(
            [
              ["hiring", "Hiring", brief.counts.hiring, "text-good"],
              ["funding", "Funding", brief.counts.funding, "text-ink"],
              ["layoffs", "Layoffs", brief.counts.layoffs, "text-bad"],
            ] as const
          ).map(([id, label, n, tone]) => (
            <Link key={id} href={`/news?kind=tech&topic=${id}`} className="flex items-baseline justify-between gap-1 rounded-[10px] bg-raised/70 px-2.5 py-1.5 hover:bg-chip">
              <span className="text-[11px] text-ink-2">{label}</span>
              <span className={cn("num text-[17px] font-light leading-none", tone)}>{n}</span>
            </Link>
          ))}
        </div>
        <div className="flex flex-col">
          {brief.signals.slice(0, 4).map((n) => (
            <NewsRow key={n.id} n={n} thumb={false} dense />
          ))}
          {!brief.signals.length && <p className="text-[12px] text-ink-2">No hiring, funding or layoff news in the last 48h.</p>}
        </div>
      </G>

      <section className="flex shrink-0 flex-col gap-2">
        <div className="flex items-baseline justify-between px-1">
          <h2 className="text-[14px] [text-shadow:0_1px_8px_rgb(0_0_0/0.5)]">{hasResume ? "Top matches · 24h" : "Freshest · 24h"}</h2>
          <Link href={hasResume ? "/for-you" : "/feed?within=24h"} className="text-[12px] text-ink-2 hover:text-ink">See all</Link>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {top4.jobs.slice(0, 2).map((j) => (
            <MiniJobCard key={j.id} job={j} glass />
          ))}
        </div>
      </section>

      <G title="Stocks" href="/market#stocks" note={stocks.lastCheck ? `updated ${stocks.lastCheck}` : undefined}>
        <StockMini items={stocks.items} configured={stocks.configured} />
      </G>
    </>
  );

  const rightWidgets = (
    <>
      <G title="Attention" note={String(attentionCount)}>
        <p className="flex items-center gap-1.5 text-[11px] text-ink-2">
          <ClipboardList size={12} /> Deadlines & programs ({closing.length + updated.length})
        </p>
        <div className="flex flex-col gap-1.5">
          {closing.slice(0, 2).map((v) => (
            <AlertRow dense key={v.p.id} severity="critical" title={v.p.name} meta={`${v.status.label} · ${v.p.org}`} href="/research" />
          ))}
          {updated.slice(0, 2).map((v) => (
            <AlertRow dense key={v.p.id} severity="good" title={`${v.p.name} page updated`} meta={`${v.p.org} · ${v.p.country}`} href="/research" />
          ))}
          {!closing.length && !updated.length && (
            <AlertRow dense severity="info" title={`${indiaOpen} Indian programs open now`} meta="ISRO, DRDO, IITs, fellowships" href="/research?f=india" />
          )}
        </div>
        <p className="flex items-center gap-1.5 text-[11px] text-ink-2">
          <Clock3 size={12} /> Matches & sources
        </p>
        <div className="flex flex-col gap-1.5">
          {attention.topMatch && (
            <AlertRow dense severity="good" title={`${attention.matchCount} new ≥80% match${attention.matchCount === 1 ? "" : "es"}`} meta={`${attention.topMatch.title} · ${attention.topMatch.company}`} href={`/?job=${encodeURIComponent(attention.topMatch.id)}`} />
          )}
          {attention.failing.slice(0, 2).map((s) => (
            <AlertRow dense key={s.name} severity="critical" title={`${s.name} is failing`} meta={s.error} href="/settings#sources" />
          ))}
          {!attention.topMatch && !attention.failing.length && <AlertRow dense severity="info" title="All sources healthy" meta={`${sources.ok} polling normally`} href="/settings#sources" />}
          {!hasResume && <AlertRow dense severity="warning" title="Upload your resume" meta="Unlocks match scores and For You" href="/settings#resume" />}
          {!telegram && <AlertRow dense severity="warning" title="Connect Telegram" meta="Instant alerts for new postings" href="/settings#channels" />}
        </div>
      </G>

      <G title="Skills in demand" href="/market" note="open early-career roles">
        {skills.hasResume ? (
          <div className="flex items-baseline justify-between gap-2">
            <span className="num text-[24px] font-light leading-none tracking-[-0.03em]">
              {skills.covered}<span className="text-[14px] text-ink-2">/{skills.top.length}</span>
              <span className="ml-1.5 text-[11px] tracking-normal text-ink-2">top skills on your resume</span>
            </span>
          </div>
        ) : (
          <p className="text-[12px] text-ink-2">
            <Link href="/settings#resume" className="underline">Upload your resume</Link> to see which of these you already have.
          </p>
        )}
        <ul className="flex flex-col gap-1.5">
          {skills.top.map((sk) => (
            <li key={sk.skill} className="grid grid-cols-[14px_minmax(0,112px)_minmax(0,1fr)_30px] items-center gap-2 text-[12px]">
              {sk.have ? <Check size={12} className="text-good" /> : <span className="size-1.5 justify-self-center rounded-full bg-ink-3" />}
              <span className={cn("truncate", !sk.have && skills.hasResume && "text-ink-2")}>{sk.skill}</span>
              <span className="h-1.5 overflow-hidden rounded-full bg-raised">
                <span className={cn("block h-full rounded-full", sk.have ? "bg-good/80" : "bg-ink-3")} style={{ width: `${Math.round((sk.share / skills.top[0].share) * 100)}%` }} />
              </span>
              <span className="num text-right text-ink-2">{Math.round(sk.share * 100)}%</span>
            </li>
          ))}
        </ul>
        {skills.learnNext && (
          <Link href={`/feed?q=${encodeURIComponent(skills.learnNext.skill)}&level=intern,newgrad,research`} className="rounded-[10px] bg-raised/70 px-3 py-2 text-[12px] hover:bg-chip">
            Learn next: <span className="text-ink">{skills.learnNext.skill}</span>
            <span className="text-ink-2"> · in {skills.learnNext.n.toLocaleString("en-IN")} open roles</span>
          </Link>
        )}
      </G>

      <G title="Posting volume" href="/market" note={`${volume.perDay.toLocaleString("en-IN")} / day`}>
        <VolumeHistogram bars={volume.bars} weeks={volume.weeks} className="h-[78px]" />
        <p className="text-[11px] text-ink-3">6-hour buckets · 4 weeks · line = weekly total</p>
      </G>
    </>
  );

  const titleAndPills = (
    <>
      <h1 className="text-[26px] font-normal leading-none tracking-[-0.03em] text-ink [text-shadow:0_1px_12px_rgb(0_0_0/0.45)] md:text-[34px]">Opportunity Radar</h1>
      <div className="pointer-events-auto mt-3">
        <MapViewPills />
      </div>
    </>
  );

  return (
    <>
      {/*
        Hero: on wide screens the live map is a full-bleed background behind the top bar (−84px = page
        padding + top bar + gap) and every widget floats over it as glass. Below xl the map is a card and
        the widgets flow underneath.
      */}
      <section className="relative mt-4 xl:h-[calc(100dvh-84px)] xl:min-h-[820px]">
        <div className="relative h-[420px] overflow-hidden rounded-card ring-1 ring-line md:h-[520px] xl:absolute xl:-top-[84px] xl:bottom-0 xl:left-[calc(50%-50vw)] xl:z-0 xl:h-auto xl:w-screen xl:rounded-none xl:ring-0">
          <MapCanvas points={map.points} news={newsPoints} hero />
          {/* fades: keep the top bar readable and melt the map into the page below */}
          <div className="pointer-events-none absolute inset-x-0 top-0 z-[1] hidden h-44 bg-linear-to-b from-canvas/90 to-transparent xl:block" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] hidden h-28 bg-linear-to-t from-canvas to-transparent xl:block" />
          <div className="pointer-events-none absolute left-5 top-5 z-10 xl:hidden">{titleAndPills}</div>
          <div className="absolute inset-x-5 bottom-5 z-10 flex items-center gap-3 xl:hidden">
            <MapZoomControls />
            <NewsTicker items={brief.ticker} className="hidden min-w-0 flex-1 md:flex" />
          </div>
        </div>

        {/* wide screens: title + pills and controls float in the gap between the columns */}
        <div className="pointer-events-none absolute left-[376px] right-[360px] top-3 z-10 hidden xl:block">{titleAndPills}</div>
        <div className="absolute bottom-6 left-[376px] right-[360px] z-10 hidden items-center gap-3 xl:flex">
          <MapZoomControls className="[&_button]:!size-10" />
          <NewsTicker items={brief.ticker} className="min-w-0 flex-1" />
        </div>

        <div className="no-scrollbar relative z-10 mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:absolute xl:bottom-4 xl:left-0 xl:top-2 xl:mt-0 xl:flex xl:w-[352px] xl:flex-col xl:overflow-y-auto">
          {leftWidgets}
        </div>
        <div className="no-scrollbar relative z-10 mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:absolute xl:bottom-4 xl:right-0 xl:top-2 xl:mt-0 xl:flex xl:w-[336px] xl:flex-col xl:overflow-y-auto">
          {rightWidgets}
        </div>
      </section>

      {/* Briefing (rotating tall card) + Recommended, side by side */}
      <section className="mt-8 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,440px)_minmax(0,1fr)] 2xl:grid-cols-[minmax(0,500px)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col">
          <div className="mb-3 flex min-h-11 items-center justify-between gap-3">
            <h2 className="text-[24px] leading-tight">
              <span className="text-ink-2">Today&apos;s</span> briefing
            </h2>
            <span className="flex gap-3 text-[13px]">
              <span className="num hidden text-ink-3 sm:inline">
                {brief.counts.tech + brief.counts.world} stories · 48h{brief.checkedAt ? ` · ${ago(brief.checkedAt)}` : ""}
              </span>
              <Link href="/news" className="text-ink-2 hover:text-ink">All news →</Link>
            </span>
          </div>
          {brief.tech.length + brief.world.length === 0 ? (
            <p className="card p-5 text-[14px] text-ink-2">
              No headlines yet. Run <code className="rounded bg-chip px-1.5 py-0.5">npm run worker -- --news</code> (the worker also refreshes news every 20 min).
            </p>
          ) : (
            <BriefingCarousel tech={brief.tech} world={brief.world} india={brief.india} className="flex-1" />
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          {/* top half: Recommended */}
          <div className="flex min-w-0 flex-col">
            <div className="mb-3 flex min-h-11 flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <h2 className="shrink-0 text-[24px] leading-tight">
                <span className="text-ink-2">Recommended</span> for you
              </h2>
              <div className="w-full max-w-[460px] [&_form]:h-11 md:w-auto">
                <HeroSearch />
              </div>
            </div>
            <FilterBar small defaults={{ within: "7d", level: early }} />
            <div className="mt-3">
              <JobsView
                key={JSON.stringify({ ...f, job: "" })}
                initial={recommended}
                total={recommended.length}
                filters={f}
                view="cards"
                topPickFirst
                withMatched={hasResume}
                gridClassName={CARD_GRID}
                emptyText="No recent postings match these filters — widen “Posted” or clear a filter."
              />
            </div>
            {rec.total > recommended.length && (
              <Link href={`/feed?within=${f.within}&sort=${f.sort}`} className="mt-2 text-[13px] text-ink-2 hover:text-ink">
                See all {rec.total.toLocaleString("en-IN")} in Feed →
              </Link>
            )}
          </div>

          {/* bottom half: Fresh in India */}
          <div className="flex min-w-0 flex-col">
            <div className="mb-3 flex min-h-11 flex-col gap-1 md:flex-row md:items-center md:justify-between">
              <h2 className="text-[24px] leading-tight">
                <span className="text-ink-2">Fresh in</span> India
                <span className="ml-3 align-middle text-[12px] text-ink-3">last 7 days · {indiaOpen} Indian programs open</span>
              </h2>
              <div className="flex gap-4 text-[13px]">
                <Link href="/feed?region=india&level=intern,newgrad,research&within=7d" className="text-ink-2 hover:text-ink">All India roles →</Link>
                <Link href="/research?f=india" className="text-ink-2 hover:text-ink">ISRO, DRDO & more →</Link>
              </div>
            </div>
            <JobsView key="india" initial={india.jobs} total={india.jobs.length} filters={{}} view="cards" withMatched={hasResume} gridClassName={CARD_GRID} emptyText="No new Indian roles this week yet." />
          </div>
        </div>
      </section>

      <PanelSlot id={f.job} />
    </>
  );
}
