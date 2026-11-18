import { ArrowLeft, ExternalLink, MapPin } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Delta, ScoreMeter } from "@/components/app/CountryBits";
import { NewsRow } from "@/components/app/NewsCards";
import { MiniJobCard } from "@/components/app/widgets";
import { Sparkline } from "@/components/ui/cards";
import { cn } from "@/components/ui/primitives";
import { countryByIso } from "@/data/countries";
import { getCountryBriefing } from "@/lib/countryQueries";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ iso: string }> }) {
  const c = countryByIso((await params).iso);
  return { title: `${c?.name ?? "Country"} briefing · RadarX` };
}

const Card = ({ title, note, children, className }: { title: string; note?: string; children: React.ReactNode; className?: string }) => (
  <section className={cn("card flex min-w-0 flex-col gap-4 p-5 md:p-6", className)}>
    <header className="flex items-baseline justify-between gap-3">
      <h2 className="text-[17px]">{title}</h2>
      {note && <span className="text-right text-[12px] text-ink-2">{note}</span>}
    </header>
    {children}
  </section>
);

function Bars({ rows }: { rows: { label: string; n: number; href?: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <ul className="flex flex-col gap-2.5">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 text-[14px]">
          {r.href ? <Link href={r.href} className="truncate hover:underline">{r.label}</Link> : <span className="truncate">{r.label}</span>}
          <span className="num text-[13px] text-ink-2">{r.n.toLocaleString("en-IN")}</span>
          <span className="col-span-2 h-1.5 overflow-hidden rounded-full bg-chip"><span className="block h-full rounded-full bg-ink" style={{ width: `${Math.max(3, (r.n / max) * 100)}%` }} /></span>
        </li>
      ))}
    </ul>
  );
}

export default async function CountryPage({ params }: { params: Promise<{ iso: string }> }) {
  const { iso } = await params;
  const b = await getCountryBriefing(iso);
  if (!b) notFound();
  const { country: c, score } = b.row;
  const feed = (extra = "") => `/feed?loc=${encodeURIComponent(b.loc)}&level=intern,newgrad,research${extra}`;
  const inr = b.fx?.inr;
  const move = b.fx && b.fx.history.length > 1 ? ((b.fx.history[b.fx.history.length - 1] - b.fx.history[0]) / b.fx.history[0]) * 100 : null;

  return (
    <>
      <Link href="/world" className="mt-8 inline-flex items-center gap-1.5 text-[13px] text-ink-2 hover:text-ink"><ArrowLeft size={14} /> World signals</Link>
      <header className="mt-4 grid gap-8 lg:grid-cols-[1fr_320px] lg:items-end">
        <div>
          <p className="text-[56px] leading-none" aria-hidden>{c.flag}</p>
          <h1 className="mt-3 text-[40px] font-light leading-none tracking-[-0.04em] md:text-[56px]">{c.name}</h1>
          <p className="mt-3 max-w-xl text-[14px] font-light text-ink-2">
            {b.row.roles ? `${b.row.roles.toLocaleString("en-IN")} open tech roles here, ${b.row.early.toLocaleString("en-IN")} early-career.` : "No open tech roles tracked here right now."}{" "}
            {b.row.topHeadline ? `Biggest story: “${b.row.topHeadline}”` : ""}
          </p>
        </div>
        <div className="card p-5">
          <p className="mb-3 flex items-center justify-between text-[12px] text-ink-2">Instability index <Delta delta={b.row.delta} /></p>
          <ScoreMeter row={b.row} size="lg" />
          <dl className="num mt-4 grid grid-cols-3 gap-2 border-t border-line pt-3 text-[12px] text-ink-2">
            <div><dt>Unrest</dt><dd className="text-ink">{score.unrest}<span className="text-ink-3">/60</span></dd></div>
            <div><dt>Hazards</dt><dd className="text-ink">{score.hazard}<span className="text-ink-3">/25</span></dd></div>
            <div><dt>Attention</dt><dd className="text-ink">{score.attention}<span className="text-ink-3">/15</span></dd></div>
          </dl>
        </div>
      </header>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <Card title="Roles here" note={`${b.jobsTotal.toLocaleString("en-IN")} early-career, 30 days`} className="lg:col-span-2">
          {b.jobs.length ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {b.jobs.map((j) => <MiniJobCard key={j.id} job={j} />)}
            </div>
          ) : (
            <p className="text-[14px] text-ink-2">No early-career tech roles matched in the last 30 days.</p>
          )}
          <Link href={feed()} className="text-[13px] text-accent hover:underline">Open all in Feed →</Link>
        </Card>

        <Card title="Where &amp; who" note="open tech roles">
          {b.cities.length ? <Bars rows={b.cities.map((x) => ({ label: x.city, n: x.n, href: `/feed?loc=${encodeURIComponent(x.city)}` }))} /> : <p className="text-[14px] text-ink-2">No city data.</p>}
          {b.companies.length > 0 && (
            <>
              <h3 className="border-t border-line pt-4 text-[13px] text-ink-2">Top hiring companies</h3>
              <Bars rows={b.companies.map((x) => ({ label: x.company, n: x.n }))} />
            </>
          )}
        </Card>

        <Card title="Headlines" note={`${b.headlines.length} from public feeds`} className="lg:col-span-2">
          {b.headlines.length ? (
            <div className="flex flex-col">{b.headlines.map((n) => <NewsRow key={n.id} n={n} />)}</div>
          ) : (
            <p className="text-[14px] text-ink-2">No placed headlines for {c.name} in the last 4 days.</p>
          )}
        </Card>

        <div className="flex min-w-0 flex-col gap-6">
          <Card title="Natural hazards" note="M4.5+ and open events">
            {b.hazards.length ? (
              <ul className="flex flex-col divide-y divide-line">
                {b.hazards.slice(0, 6).map((h) => (
                  <li key={h.id} className="flex items-center gap-2.5 py-2 first:pt-0">
                    <MapPin size={14} className="shrink-0 text-ink-2" />
                    <span className="min-w-0 flex-1"><span className="block truncate text-[13px]">{h.title}</span><span className="text-[11px] text-ink-2">{h.kind} · {h.ago}</span></span>
                    {h.url && /^https?:\/\//.test(h.url) && <a href={h.url} target="_blank" rel="noreferrer noopener" aria-label="Source" className="text-ink-2 hover:text-ink"><ExternalLink size={14} /></a>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[14px] text-ink-2">Nothing notable in the last 5 days.</p>
            )}
          </Card>

          {b.fx && (
            <Card title={`${b.fx.currency} → INR`} note="ECB rate">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="num text-[32px] font-light leading-none tracking-[-0.03em]">{inr ? `₹${inr.toFixed(2)}` : "—"}</p>
                  <p className="mt-1.5 text-[12px] text-ink-2">per 1 {b.fx.currency}{move != null && <span className={cn("num ml-2", move >= 0 ? "text-good" : "text-bad")}>{move >= 0 ? "+" : ""}{move.toFixed(1)}% /30d</span>}</p>
                </div>
                <Sparkline values={b.fx.history} width={110} height={40} />
              </div>
              <p className="text-[12px] text-ink-3">1 USD = {b.fx.perUsd.toFixed(2)} {b.fx.currency}</p>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
