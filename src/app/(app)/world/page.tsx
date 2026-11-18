import { ExternalLink, MapPin } from "lucide-react";
import Link from "next/link";
import { MapCanvas, MapViewPills, MapZoomControls } from "@/components/app/HomeMap";
import { Sparkline } from "@/components/ui/cards";
import { HeroTitle, cn } from "@/components/ui/primitives";
import { CountryTile } from "@/components/app/CountryBits";
import { getCountryBoard } from "@/lib/countryQueries";
import { getFx, getHazards, getHubRisks, type HazardView } from "@/lib/worldQueries";

export const dynamic = "force-dynamic";
export const metadata = { title: "World · RadarX" };

const KIND: Record<HazardView["kind"], { label: string; dot: string }> = {
  quake: { label: "Earthquake", dot: "#ff6b57" },
  storm: { label: "Storm", dot: "#5ab0ff" },
  wildfire: { label: "Wildfire", dot: "#ff9f1c" },
  volcano: { label: "Volcano", dot: "#ff4d8d" },
  flood: { label: "Flood", dot: "#4dd4c4" },
  other: { label: "Event", dot: "#b0b0b8" },
};

const Card = ({ title, note, children, className }: { title: string; note?: string; children: React.ReactNode; className?: string }) => (
  <section className={cn("card flex min-w-0 flex-col gap-4 p-5 md:p-6", className)}>
    <header className="flex items-baseline justify-between gap-3">
      <h2 className="text-[17px]">{title}</h2>
      {note && <span className="text-[12px] text-ink-2">{note}</span>}
    </header>
    {children}
  </section>
);

export default async function WorldPage() {
  const [hazards, { fx, at }, board] = await Promise.all([getHazards(72, 4.5), getFx(), getCountryBoard()]);
  const risks = await getHubRisks(hazards);
  const count = (k: HazardView["kind"]) => hazards.filter((h) => h.kind === k).length;
  const strong = hazards.filter((h) => h.kind === "quake" && (h.mag ?? 0) >= 5.5).length;
  const inr = fx?.rates.INR ?? null;
  const inrHist = fx?.history.INR ?? [];
  const inrMove = inrHist.length > 1 ? ((inrHist[inrHist.length - 1] - inrHist[0]) / inrHist[0]) * 100 : null;
  const tiles = [
    { label: "Quakes M4.5+", n: count("quake"), note: `${strong} at M5.5+` },
    { label: "Storms", n: count("storm"), note: "open" },
    { label: "Wildfires", n: count("wildfire"), note: "open" },
    { label: "Volcano / flood", n: count("volcano") + count("flood"), note: "open" },
  ];

  return (
    <>
      <header className="mt-10 grid gap-6 lg:mt-14 lg:grid-cols-[1fr_auto] lg:items-end">
        <HeroTitle light="World" strong="signals" />
        <p className="max-w-md text-[14px] font-light text-ink-2">
          Live earthquakes (USGS) and natural events (NASA EONET), checked against the cities where roles are being posted, plus the USD→INR rate for judging stipends. Free public data, refreshed every 15 minutes.
        </p>
      </header>

      <section className="card relative mt-8 h-[340px] overflow-hidden !p-0 md:h-[460px]">
        <MapCanvas points={[]} hazards={hazards} view="world" panelInset={0} />
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-wrap items-start justify-between gap-3 p-5">
          <div className="pointer-events-auto"><MapViewPills /></div>
        </div>
        <MapZoomControls className="absolute bottom-5 right-5 z-10" />
      </section>

      <section className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="Summary">
        {tiles.map((t) => (
          <div key={t.label} className="card p-5">
            <p className="text-[13px] text-ink-2">{t.label}</p>
            <p className="num mt-2 text-[40px] font-light leading-none tracking-[-0.04em]">{t.n}</p>
            <p className="mt-2 text-[12px] text-ink-3">{t.note}</p>
          </div>
        ))}
      </section>

      <section className="mt-10" aria-labelledby="cii">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <h2 id="cii" className="text-[20px]"><span className="text-ink-2">Country</span> instability index</h2>
          <p className="max-w-xl text-[12px] text-ink-3">
            RadarX estimate, 0–100, from conflict &amp; unrest headlines (weighted by outlets covering them), natural hazards, and news attention. A heuristic for where the world is loud right now, not an official risk rating. Tap a country for its briefing.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {board.slice(0, 12).map((r) => <CountryTile key={r.country.iso} row={r} />)}
        </div>
        {board.length > 12 && (
          <details className="group mt-4">
            <summary className="cursor-pointer text-[13px] text-ink-2 hover:text-ink">Show {board.length - 12} more countries</summary>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {board.slice(12).map((r) => <CountryTile key={r.country.iso} row={r} />)}
            </div>
          </details>
        )}
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card title="Near your job hubs" note="cities with roles in the last 7 days">
          {risks.length ? (
            <ul className="flex flex-col divide-y divide-line">
              {risks.slice(0, 8).map((r) => (
                <li key={r.city} className="flex items-center gap-3 py-2.5 first:pt-0">
                  <span className="block size-2.5 shrink-0 rounded-full" style={{ background: KIND[r.hazard.kind].dot }} />
                  <div className="min-w-0 flex-1">
                    <Link href={`/feed?within=7d&loc=${encodeURIComponent(r.city)}`} className="flex items-center gap-1.5 text-[14px] hover:underline">
                      <MapPin size={13} className="text-ink-2" /> {r.city}
                      {r.india && <span className="rounded-full bg-chip px-1.5 text-[10px] text-ink-2">India</span>}
                    </Link>
                    <p className="truncate text-[12px] text-ink-2">{r.hazard.title} · {r.distanceKm} km away · {r.hazard.ago}</p>
                  </div>
                  <span className="num shrink-0 text-[12px] text-ink-2">{r.roles} role{r.roles === 1 ? "" : "s"}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[14px] text-ink-2">Nothing significant is close to a city with open roles right now.</p>
          )}
        </Card>

        <Card title="USD → INR" note={at ? `ECB rate · updated ${at}` : undefined}>
          {inr ? (
            <>
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="num text-[44px] font-light leading-none tracking-[-0.04em]">₹{inr.toFixed(2)}</p>
                  {inrMove != null && <p className={cn("num mt-2 text-[13px]", inrMove >= 0 ? "text-good" : "text-bad")}>{inrMove >= 0 ? "+" : ""}{inrMove.toFixed(1)}% in 30 days</p>}
                </div>
                <Sparkline values={inrHist} width={140} height={48} />
              </div>
              <table className="w-full text-[14px]">
                <caption className="sr-only">Monthly stipend in USD converted to INR</caption>
                <thead><tr className="text-left text-[12px] text-ink-2"><th className="pb-2 font-normal">Stipend / month</th><th className="pb-2 text-right font-normal">In INR</th></tr></thead>
                <tbody>
                  {[1000, 2500, 5000, 8000].map((usd) => (
                    <tr key={usd} className="border-t border-line"><td className="num py-2">${usd.toLocaleString("en-US")}</td><td className="num py-2 text-right">₹{Math.round(usd * inr).toLocaleString("en-IN")}</td></tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : (
            <p className="text-[14px] text-ink-2">No rate yet. Run <code className="rounded bg-chip px-1.5 py-0.5">npm run worker -- --world</code>.</p>
          )}
        </Card>
      </div>

      <Card title="Latest events" note={`${hazards.length} in the last 72h`} className="mt-6">
        {hazards.length ? (
          <ul className="grid gap-x-8 md:grid-cols-2">
            {hazards.slice(0, 24).map((h) => (
              <li key={h.id} className="flex items-center gap-3 border-t border-line py-2.5">
                <span className="num flex size-9 shrink-0 items-center justify-center rounded-full border-2 text-[11px]" style={{ borderColor: KIND[h.kind].dot }}>
                  {h.mag != null ? h.mag.toFixed(1) : ""}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px]">{h.title}</p>
                  <p className="text-[12px] text-ink-2">{KIND[h.kind].label} · {h.ago}</p>
                </div>
                {h.url && /^https?:\/\//.test(h.url) && (
                  <a href={h.url} target="_blank" rel="noreferrer noopener" aria-label={`Open source for ${h.title}`} className="shrink-0 text-ink-2 hover:text-ink">
                    <ExternalLink size={15} />
                  </a>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[14px] text-ink-2">No events yet. Run <code className="rounded bg-chip px-1.5 py-0.5">npm run worker -- --world</code> (the worker also refreshes every 15 min).</p>
        )}
      </Card>
    </>
  );
}
