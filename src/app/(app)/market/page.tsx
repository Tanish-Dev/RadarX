import { StockCard } from "@/components/app/Stocks";
import { getStocks } from "@/lib/stockQueries";
import Link from "next/link";
import { VolumeChart } from "@/components/app/charts";
import { Chip, cn, HeroTitle } from "@/components/ui/primitives";
import type { RawParams } from "@/lib/filters";
import { getMarket } from "@/lib/queries";

export const dynamic = "force-dynamic";
export const metadata = { title: "Market · RadarX" };

function Giant({ value, caption }: { value: string; caption: string }) {
  return (
    <div className="min-w-0">
      <p className="num text-[56px] font-medium leading-none tracking-[-0.06em] md:text-[84px]">{value}</p>
      <p className="mt-3 max-w-[240px] text-[14px] text-ink-2">{caption}</p>
    </div>
  );
}

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
  <section className={cn("card flex flex-col gap-5 p-6 md:p-7", className)}>
    <div className="flex items-baseline justify-between gap-3">
      <h2 className="text-[19px]">{title}</h2>
      {note && <span className="text-right text-[12px] text-ink-2">{note}</span>}
    </div>
    {children}
  </section>
);

export default async function MarketPage({ searchParams }: { searchParams: Promise<RawParams> }) {
  const sp = await searchParams;
  const days = sp.days === "90" ? 90 : 30;
  const [m, stocks] = await Promise.all([getMarket(days), getStocks()]);
  const sign = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
  return (
    <>
      <div className="mt-10 lg:mt-14">
        <HeroTitle light="Market" strong="Insights" />
      </div>

      {/* ref-04 giant numerals, ref-00 styling */}
      <section className="mt-10 grid grid-cols-1 gap-10 border-y border-line py-10 sm:grid-cols-3">
        <Giant value={m.aiDelta == null ? m.aiCount.toLocaleString("en-IN") : `${sign(m.aiDelta)}%`} caption={m.aiDelta == null ? "AI/ML postings in the last 30 days" : "AI/ML postings, last 30 days vs the 30 before"} />
        <Giant value={m.weekNew.toLocaleString("en-IN")} caption={`new tech roles this week${m.weekDelta != null ? ` (${sign(m.weekDelta)}% vs last week)` : ""}`} />
        <Giant
          value={m.indiaInternRatio == null ? m.indiaInternCount.toLocaleString("en-IN") : `${m.indiaInternRatio.toFixed(1)}×`}
          caption={m.indiaInternRatio == null ? "India tech internships posted this month" : "India tech-intern demand vs last month"}
        />
      </section>

      {/* Stock watchlist */}
      <section id="stocks" className="mt-8 scroll-mt-24">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <h2 className="text-[20px]">
            <span className="text-ink-2">Stocks</span> you track
          </h2>
          <span className="text-[12px] text-ink-3">
            Twelve Data · refreshed in rotation every {Number(process.env.STOCK_INTERVAL_MIN) || 30} min{stocks.lastCheck ? ` · last check ${stocks.lastCheck}` : ""} · free-plan quotes can be delayed
          </span>
        </div>
        {!stocks.configured && (
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
        {(["AI & chips", "Big Tech", "India"] as const).map((g) => (
          <div key={g} className="mb-4">
            <p className="mb-2 text-[12px] text-ink-2">{g}</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              {stocks.items.filter((x) => x.group === g).map((x) => (
                <StockCard key={x.key} s={x} />
              ))}
            </div>
          </div>
        ))}
      </section>

      <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card title="New tech postings per day" className="lg:col-span-2" note={`${m.daily.reduce((s, d) => s + d.n, 0).toLocaleString("en-IN")} in ${days} days`}>
          <div className="-mt-2 flex gap-2">
            {[30, 90].map((d) => (
              <Link key={d} href={`/market?days=${d}`} className={cn("h-9 rounded-full px-4 text-[13px] leading-9", days === d ? "bg-active text-active-ink" : "border border-line")}>
                {d} days
              </Link>
            ))}
          </div>
          <VolumeChart data={m.daily} />
        </Card>
        <Card title="Your skill gap" note="in-demand for early-career roles, missing from your resume">
          {m.hasResume ? (
            m.gap.length ? <Bars rows={m.gap.map((g) => ({ label: g.skill, n: g.n }))} tone="accent" /> : <p className="text-[14px] text-ink-2">No gaps in the top skills — nice.</p>
          ) : (
            <p className="text-[14px] font-light text-ink-2">
              <Link href="/settings#resume" className="text-accent">Upload your resume</Link> to see which in-demand skills you're missing.
            </p>
          )}
        </Card>

        <Card title="Top hiring companies" note="tech postings, last 30 days">
          <Bars rows={m.topCompanies.map((c) => ({ label: c.company, n: c.n }))} />
        </Card>
        <Card title="Most-demanded skills" note="last 30 days">
          <Bars rows={m.demanded.slice(0, 10).map((s) => ({ label: s.skill, n: s.n }))} />
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
            <p className="text-[14px] font-light text-ink-2">
              Unlocks after 60 days of RadarX history (day {m.historyDays}). Job boards only list open roles, so comparing with last month before then would overstate growth.
            </p>
          )}
        </Card>

        <Card title="Level split" note="last 30 days">
          <Split
            parts={[
              { label: "Intern", n: m.levels.intern ?? 0, color: "var(--accent)" },
              { label: "New grad", n: m.levels.newgrad ?? 0, color: "var(--green)" },
              { label: "Research", n: m.levels.research ?? 0, color: "var(--orange)" },
              { label: "Experienced", n: m.levels.experienced ?? 0, color: "var(--text-3)" },
            ]}
          />
        </Card>
        <Card title="Where the roles are" note="last 30 days">
          <Split
            parts={[
              { label: "India", n: m.regions.india ?? 0, color: "#FF9F43" },
              { label: "Remote", n: m.regions.remote ?? 0, color: "var(--accent)" },
              { label: "Abroad", n: m.regions.global ?? 0, color: "var(--text-3)" },
            ]}
          />
        </Card>
        <Card title="Companies that went quiet" note="≥8 postings last month, ¼ or less now">
          {m.quiet.length ? (
            <Bars rows={m.quiet.map((q) => ({ label: q.company, n: q.prev, hint: `${q.prev} → ${q.cur}` }))} />
          ) : (
            <p className="text-[14px] text-ink-2">Nobody has slowed down sharply.</p>
          )}
          <div className="mt-auto border-t border-line pt-4 text-[14px]">
            <span className="text-ink-2">Avg. time a posting stays open: </span>
            <span className="num">{m.avgOpenDays != null ? `${m.avgOpenDays.toFixed(1)} days` : `collecting (${m.closedSample} closed so far)`}</span>
          </div>
        </Card>
      </div>
    </>
  );
}
