import { StockCard } from "@/components/app/Stocks";
import { getStocks } from "@/lib/stockQueries";
import { getViewer } from "@/lib/viewer";
import Link from "next/link";
import { VolumeChart } from "@/components/app/charts";
import { Chip, cn, HeroTitle } from "@/components/ui/primitives";
import type { RawParams } from "@/lib/filters";
import { getMarket } from "@/lib/queries";
import { getFx } from "@/lib/worldQueries";
import { Sparkline } from "@/components/ui/cards";

export const dynamic = "force-dynamic";
export const metadata = { title: "Market · RadarX" };

function Bars({ rows, max, tone = "ink" }: { rows: { label: string; n: number; hint?: string }[]; max?: number; tone?: "ink" | "accent" }) {
  const m = max ?? Math.max(1, ...rows.map((r) => r.n));
  return (
    <ul className="flex flex-col gap-2.5">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 text-[14px]">
          <span className="truncate">{r.label}</span>
          <span className="num text-[13px] text-ink-2">{r.hint ?? r.n.toLocaleString("en-IN")}</span>
          <span className="col-span-2 h-1.5 overflow-hidden rounded-full bg-chip">
            <span className={cn("block h-full rounded-full", tone === "accent" ? "bg-good" : "bg-ink")} style={{ width: `${Math.max(3, (r.n / m) * 100)}%` }} />
          </span>
        </li>
      ))}
    </ul>
  );
}

function Split({ parts }: { parts: { label: string; n: number; color: string }[] }) {
  const total = Math.max(1, parts.reduce((s, p) => s + p.n, 0));
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full">
        {parts.map((p) => (
          <span key={p.label} style={{ width: `${(p.n / total) * 100}%`, background: p.color }} title={`${p.label}: ${p.n}`} />
        ))}
      </div>
      <ul className="mt-4 grid grid-cols-2 gap-3">
        {parts.map((p) => (
          <li key={p.label} className="flex items-center gap-2 text-[14px]">
            <span className="size-2.5 rounded-full" style={{ background: p.color }} />
            {p.label}
            <span className="num ml-auto text-ink-2">{Math.round((p.n / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const Card = ({ title, note, children, className }: { title: string; note?: string; children: React.ReactNode; className?: string }) => (
  <section className={cn("card flex min-w-0 flex-col gap-5 p-5 md:p-6", className)}>
    <div className="flex items-baseline justify-between gap-3">
      <h3 className="text-[17px]">{title}</h3>
      {note && <span className="text-right text-[12px] text-ink-2">{note}</span>}
    </div>
    {children}
  </section>
);

/** Section heading with a one-line description; the id is the sticky nav's anchor. */
const Section = ({ id, title, lead, aside, children }: { id: string; title: string; lead: string; aside?: React.ReactNode; children: React.ReactNode }) => (
  <section id={id} className="mt-14 scroll-mt-32">
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-[26px] font-light tracking-[-0.03em]">{title}</h2>
        <p className="mt-1 max-w-xl text-[13px] text-ink-2">{lead}</p>
      </div>
      {aside}
    </div>
    {children}
  </section>
);

const Kpi = ({ label, value, note, tone }: { label: string; value: string; note: string; tone?: "good" | "bad" | "muted" }) => (
  <div className="card flex min-w-0 flex-col gap-3 p-5">
    <p className="text-[13px] text-ink-2">{label}</p>
    <p className="num text-[40px] font-light leading-none tracking-[-0.05em] md:text-[48px]">{value}</p>
    <p className={cn("text-[12px]", tone === "good" ? "text-good" : tone === "bad" ? "text-bad" : "text-ink-3")}>{note}</p>
  </div>
);

const SECTIONS = [
  ["overview", "Overview"],
  ["hiring", "Hiring"],
  ["skills", "Skills"],
  ["companies", "Companies"],
  ["stocks", "Stocks"],
] as const;

export default async function MarketPage({ searchParams }: { searchParams: Promise<RawParams> }) {
  const sp = await searchParams;
  const days = sp.days === "90" ? 90 : 30;
  const viewer = await getViewer();
  // stock quotes come from a personal-use API plan → owner only; visitors see the rupee rate
  const [m, stocks, { fx }] = await Promise.all([getMarket(days), viewer.owner ? getStocks() : Promise.resolve(null), getFx()]);
  // skill gap against the viewer's own skills (visitors never see the owner's resume gap)
  const mySkills = new Set(viewer.profile?.skills ?? []);
  const gap = viewer.owner ? m.gap : m.demanded.filter((d) => !mySkills.has(d.skill)).slice(0, 8);
  const hasSkills = viewer.owner ? m.hasResume : mySkills.size > 0;
  const sign = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
  const inr = fx?.rates.INR;
  const inrHist = fx?.history.INR ?? [];
  const tone = (n: number | null) => (n == null ? "muted" : n >= 0 ? "good" : "bad") as "good" | "bad" | "muted";
  const total = m.daily.reduce((s, d) => s + d.n, 0);

  return (
    <>
      <div className="mt-10 flex flex-wrap items-end justify-between gap-4 lg:mt-14">
        <HeroTitle light="Market" strong="Insights" />
        <div className="flex gap-2" role="group" aria-label="Time range">
          {[30, 90].map((d) => (
            <Link key={d} href={`/market?days=${d}`} aria-current={days === d ? "true" : undefined} className={cn("flex h-10 items-center rounded-full px-5 text-[14px]", days === d ? "bg-active text-active-ink" : "border border-line bg-raised hover:bg-chip")}>
              {d} days
            </Link>
          ))}
        </div>
      </div>

      {/* sticky section nav */}
      <nav aria-label="Market sections" className="sticky top-3 z-20 -mx-1 mt-8 overflow-x-auto px-1 py-2 [scrollbar-width:none]">
        <ul className="glass inline-flex gap-1 !rounded-full p-1">
          {SECTIONS.map(([id, label]) => (
            <li key={id}><a href={`#${id}`} className="flex h-9 items-center rounded-full px-4 text-[13px] text-ink-2 transition-colors hover:bg-chip hover:text-ink">{label}</a></li>
          ))}
        </ul>
      </nav>

      <section id="overview" className="mt-6 scroll-mt-32">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi label="AI/ML postings" value={m.aiDelta == null ? m.aiCount.toLocaleString("en-IN") : `${sign(m.aiDelta)}%`} note={m.aiDelta == null ? "last 30 days" : "vs the 30 days before"} tone={tone(m.aiDelta)} />
          <Kpi label="New tech roles this week" value={m.weekNew.toLocaleString("en-IN")} note={m.weekDelta != null ? `${sign(m.weekDelta)}% vs last week` : "first week of history"} tone={tone(m.weekDelta)} />
          <Kpi label="India tech internships" value={m.indiaInternRatio == null ? m.indiaInternCount.toLocaleString("en-IN") : `${m.indiaInternRatio.toFixed(1)}×`} note={m.indiaInternRatio == null ? "posted this month" : "demand vs last month"} tone={m.indiaInternRatio == null ? "muted" : tone(m.indiaInternRatio - 1)} />
          <Kpi label="Avg. time a role stays open" value={m.avgOpenDays != null ? `${m.avgOpenDays.toFixed(1)}d` : "—"} note={m.avgOpenDays != null ? "apply early, they close" : `collecting (${m.closedSample} closed so far)`} />
        </div>
      </section>

      <Section id="hiring" title="Hiring" lead="How many tech roles are appearing, and for whom.">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card title="New tech postings per day" className="lg:col-span-2" note={`${total.toLocaleString("en-IN")} in ${days} days`}>
            <VolumeChart data={m.daily} />
          </Card>
          <div className="grid grid-cols-1 gap-4">
            <Card title="Level split" note="last 30 days">
              <Split parts={[
                { label: "Intern", n: m.levels.intern ?? 0, color: "var(--accent)" },
                { label: "New grad", n: m.levels.newgrad ?? 0, color: "var(--green)" },
                { label: "Research", n: m.levels.research ?? 0, color: "var(--orange)" },
                { label: "Experienced", n: m.levels.experienced ?? 0, color: "var(--text-3)" },
              ]} />
            </Card>
            <Card title="Where the roles are" note="last 30 days">
              <Split parts={[
                { label: "India", n: m.regions.india ?? 0, color: "#FF9F43" },
                { label: "Remote", n: m.regions.remote ?? 0, color: "var(--accent)" },
                { label: "Abroad", n: m.regions.global ?? 0, color: "var(--text-3)" },
              ]} />
            </Card>
          </div>
        </div>
      </Section>

      <Section id="skills" title="Skills" lead="What employers ask for, and where your resume falls short.">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card title="Most-demanded skills" note="last 30 days"><Bars rows={m.demanded.slice(0, 10).map((s) => ({ label: s.skill, n: s.n }))} /></Card>
          <Card title="Your skill gap" note="in demand, missing from your resume">
            {hasSkills ? (
              gap.length ? <Bars rows={gap.map((g) => ({ label: g.skill, n: g.n }))} tone="accent" /> : <p className="text-[14px] text-ink-2">No gaps in the top skills — nice.</p>
            ) : (
              <p className="text-[14px] font-light text-ink-2"><Link href={viewer.owner ? "/settings#resume" : "/for-you#skills"} className="text-accent">{viewer.owner ? "Upload your resume" : "Add your skills"}</Link> to see which in-demand skills you&apos;re missing.</p>
            )}
          </Card>
          <Card title="Rising skills" note="this 30 days vs previous 30">
            {m.rising.length ? (
              <ul className="flex flex-col gap-3">
                {m.rising.map((r) => (
                  <li key={r.skill} className="flex items-center justify-between gap-3 text-[14px]">
                    {r.skill}
                    <Chip tone="new" className="h-7 text-[12px]">{r.prev ? `+${Math.round(((r.n - r.prev) / r.prev) * 100)}%` : "new"} · {r.n}</Chip>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[14px] font-light text-ink-2">Unlocks after 60 days of RadarX history (day {m.historyDays}). Job boards only list open roles, so comparing with last month before then would overstate growth.</p>
            )}
          </Card>
        </div>
      </Section>

      <Section id="companies" title="Companies" lead="Who is hiring hardest, and who just went quiet.">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card title="Top hiring companies" note="tech postings, last 30 days"><Bars rows={m.topCompanies.map((c) => ({ label: c.company, n: c.n }))} /></Card>
          <Card title="Companies that went quiet" note="≥8 postings last month, ¼ or less now">
            {m.quiet.length ? <Bars rows={m.quiet.map((q) => ({ label: q.company, n: q.prev, hint: `${q.prev} → ${q.cur}` }))} /> : <p className="text-[14px] text-ink-2">Nobody has slowed down sharply.</p>}
          </Card>
        </div>
      </Section>

      <Section
        id="stocks"
        title={stocks ? "Stocks & currency" : "Currency"}
        lead={stocks ? "The companies you're applying to, plus the rupee." : "The rupee against the dollar, for judging stipends abroad."}
        aside={stocks ? <span className="text-[12px] text-ink-3">Twelve Data · every {Number(process.env.STOCK_INTERVAL_MIN) || 30} min{stocks.lastCheck ? ` · last check ${stocks.lastCheck}` : ""} · free-plan quotes can lag</span> : undefined}
      >
        {inr && (
          <Link href="/#world" className="card rx-lift mb-4 flex items-center justify-between gap-4 p-5">
            <div>
              <p className="text-[13px] text-ink-2">USD → INR (ECB)</p>
              <p className="num mt-1 text-[32px] font-light leading-none tracking-[-0.04em]">₹{inr.toFixed(2)}</p>
            </div>
            <Sparkline values={inrHist} width={160} height={44} />
          </Link>
        )}
        {stocks && !stocks.configured && (
          <div className="card mb-4 flex flex-col gap-2 p-5 text-[13px] text-ink-2">
            <p className="text-[15px] text-ink">Add a free Twelve Data key to track all {stocks.items.length} stocks</p>
            <ol className="list-decimal space-y-1 pl-5">
              <li>Sign up at <a className="text-accent underline" href="https://twelvedata.com/pricing" target="_blank" rel="noreferrer">twelvedata.com/pricing</a> (free Basic plan: 800 credits/day).</li>
              <li>Add <code className="rounded bg-chip px-1.5 py-0.5">TWELVEDATA_API_KEY=your_key</code> to <code className="rounded bg-chip px-1.5 py-0.5">.env.local</code> and restart <code className="rounded bg-chip px-1.5 py-0.5">npm run dev</code> and the worker.</li>
              <li>Run <code className="rounded bg-chip px-1.5 py-0.5">npm run worker -- --stocks</code> twice (7 symbols per run to respect the 8/minute limit).</li>
            </ol>
            <p className="text-[12px] text-ink-3">Until then only Apple shows, via Twelve Data&apos;s public demo key.</p>
          </div>
        )}
        {stocks && (["AI & chips", "Big Tech", "India"] as const).map((g) => (
          <div key={g} className="mb-5">
            <p className="mb-2 text-[12px] text-ink-2">{g}</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              {stocks.items.filter((x) => x.group === g).map((x) => <StockCard key={x.key} s={x} />)}
            </div>
          </div>
        ))}
      </Section>
    </>
  );
}
