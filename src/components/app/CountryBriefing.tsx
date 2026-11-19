/** Country briefing as a slide-over on Home (`?country=IN`). Server component; the shell is CountryPanelShell. */
import { ExternalLink, MapPin } from "lucide-react";
import Link from "next/link";
import { Delta, ScoreMeter } from "@/components/app/CountryBits";
import { CountryPanelShell } from "@/components/app/CountryPanelShell";
import { NewsRow } from "@/components/app/NewsCards";
import { MarketCard, OutageList } from "@/components/app/SignalBits";
import { MiniJobCard } from "@/components/app/widgets";
import { Sparkline } from "@/components/ui/cards";
import { cn } from "@/components/ui/primitives";
import { getCountryBriefing } from "@/lib/countryQueries";
import { getCountryMarkets, getOutages } from "@/lib/signalQueries";
import { getViewer } from "@/lib/viewer";

const Card = ({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) => (
  <section className="card flex min-w-0 flex-col gap-3 p-5">
    <header className="flex items-baseline justify-between gap-3">
      <h3 className="text-[16px]">{title}</h3>
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
          <span aria-hidden className="col-span-2 h-1.5 overflow-hidden rounded-full bg-chip"><span className="block h-full rounded-full bg-ink" style={{ width: `${Math.max(3, (r.n / max) * 100)}%` }} /></span>
        </li>
      ))}
    </ul>
  );
}

const flagOf = (iso: string) => String.fromCodePoint(...[...iso].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));
const regionName = (iso: string) => {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(iso) ?? iso;
  } catch {
    return iso;
  }
};

export async function CountrySlot({ iso: raw }: { iso: string }) {
  const iso = raw.toUpperCase();
  if (!/^[A-Z]{2}$/.test(iso)) return null;
  const [b, { outages }, markets] = await Promise.all([getViewer().then((v) => getCountryBriefing(iso, v)), getOutages(), getCountryMarkets(iso)]);
  const outage = outages.filter((o) => o.iso === iso);

  // a country outside the 65-country gazetteer: still show what we know (internet, markets, a news search)
  if (!b) {
    const name = regionName(iso);
    return (
      <CountryPanelShell label={`${name} briefing`}>
        <header>
          <p className="text-[44px] leading-none" aria-hidden>{flagOf(iso)}</p>
          <h2 className="mt-3 text-[34px] font-light leading-none tracking-[-0.03em]">{name}</h2>
          <p className="mt-3 text-[14px] font-light text-ink-2">RadarX doesn’t track roles or an instability score for {name} yet — here’s the live signal it does have.</p>
        </header>
        <Card title="Internet" note="IODA, last 48h">
          <OutageList outages={outage} empty={`No national internet disruption detected in ${name}.`} />
        </Card>
        {markets.length > 0 && (
          <Card title="Prediction markets" note="Polymarket">
            <ul>{markets.map((m) => <MarketCard key={m.id} m={m} />)}</ul>
          </Card>
        )}
        <Link href={`/news?q=${encodeURIComponent(name)}`} className="text-[13px] text-accent hover:underline">Search the news for {name} →</Link>
      </CountryPanelShell>
    );
  }

  const { country: c, score } = b.row;
  const feed = `/feed?loc=${encodeURIComponent(b.loc)}&level=intern,newgrad,research`;
  const inr = b.fx?.inr;
  const move = b.fx && b.fx.history.length > 1 ? ((b.fx.history[b.fx.history.length - 1] - b.fx.history[0]) / b.fx.history[0]) * 100 : null;

  return (
    <CountryPanelShell label={`${c.name} briefing`}>
      <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-[44px] leading-none" aria-hidden>{c.flag}</p>
          <h2 className="mt-3 text-[34px] font-light leading-none tracking-[-0.03em]">{c.name}</h2>
          <p className="mt-3 text-[14px] font-light text-ink-2">
            {b.row.roles ? `${b.row.roles.toLocaleString("en-IN")} open tech roles, ${b.row.early.toLocaleString("en-IN")} early-career.` : "No open tech roles tracked here right now."}
          </p>
        </div>
        <div className="card w-full shrink-0 p-4 sm:w-[220px]">
          <p className="mb-2 flex items-center justify-between text-[12px] text-ink-2">Instability <Delta delta={b.row.delta} /></p>
          <ScoreMeter row={b.row} size="md" />
          <dl className="num mt-3 grid grid-cols-3 gap-1 border-t border-line pt-2 text-[11px] text-ink-2">
            <div><dt>Unrest</dt><dd className="text-ink">{score.unrest}<span className="text-ink-3">/60</span></dd></div>
            <div><dt>Hazards</dt><dd className="text-ink">{score.hazard}<span className="text-ink-3">/25</span></dd></div>
            <div><dt>Attention</dt><dd className="text-ink">{score.attention}<span className="text-ink-3">/15</span></dd></div>
          </dl>
        </div>
      </header>

      <Card title="Roles here" note={`${b.jobsTotal.toLocaleString("en-IN")} early-career · 30 days`}>
        {b.jobs.length ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{b.jobs.map((j) => <MiniJobCard key={j.id} job={j} />)}</div>
        ) : (
          <p className="text-[14px] text-ink-2">No early-career tech roles matched in the last 30 days.</p>
        )}
        <Link href={feed} className="text-[13px] text-accent hover:underline">Open all in Feed →</Link>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card title="Internet" note="IODA · 48h">
          <OutageList outages={outage} limit={3} empty="No national disruption detected." />
        </Card>
        {b.fx ? (
          <Card title={`${b.fx.currency} → INR`} note="ECB">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="num text-[28px] font-light leading-none tracking-[-0.03em]">{inr ? `₹${inr.toFixed(2)}` : "—"}</p>
                {move != null && <p className={cn("num mt-1.5 text-[12px]", move >= 0 ? "text-good" : "text-bad")}>{move >= 0 ? "+" : ""}{move.toFixed(1)}% /30d</p>}
              </div>
              <Sparkline values={b.fx.history} width={90} height={36} />
            </div>
          </Card>
        ) : (
          <Card title="Natural hazards" note="5 days">
            <p className="text-[14px] text-ink-2">{b.hazards.length ? `${b.hazards.length} active` : "Nothing notable."}</p>
          </Card>
        )}
      </div>

      {markets.length > 0 && (
        <Card title="Prediction markets" note="Polymarket">
          <ul>{markets.map((m) => <MarketCard key={m.id} m={m} />)}</ul>
        </Card>
      )}

      <Card title="Headlines" note={`${b.headlines.length} · 4 days`}>
        {b.headlines.length ? <div className="flex flex-col">{b.headlines.map((n) => <NewsRow key={n.id} n={n} />)}</div> : <p className="text-[14px] text-ink-2">No placed headlines for {c.name} in the last 4 days.</p>}
      </Card>

      {(b.cities.length > 0 || b.companies.length > 0) && (
        <Card title="Where &amp; who" note="open tech roles">
          {b.cities.length > 0 && <Bars rows={b.cities.map((x) => ({ label: x.city, n: x.n, href: `/feed?loc=${encodeURIComponent(x.city)}` }))} />}
          {b.companies.length > 0 && (
            <>
              <h4 className="border-t border-line pt-3 text-[13px] text-ink-2">Top hiring companies</h4>
              <Bars rows={b.companies.map((x) => ({ label: x.company, n: x.n }))} />
            </>
          )}
        </Card>
      )}

      {b.hazards.length > 0 && b.fx && (
        <Card title="Natural hazards" note="M4.5+ and open events">
          <ul className="flex flex-col divide-y divide-line">
            {b.hazards.slice(0, 6).map((h) => (
              <li key={h.id} className="flex items-center gap-2.5 py-2 first:pt-0">
                <MapPin size={14} className="shrink-0 text-ink-2" />
                <span className="min-w-0 flex-1"><span className="block truncate text-[13px]">{h.title}</span><span className="text-[11px] text-ink-2">{h.kind} · {h.ago}</span></span>
                {h.url && /^https?:\/\//.test(h.url) && <a href={h.url} target="_blank" rel="noreferrer noopener" aria-label="Source" className="text-ink-2 hover:text-ink"><ExternalLink size={14} /></a>}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </CountryPanelShell>
  );
}
