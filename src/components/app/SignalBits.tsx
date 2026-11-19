/** World Monitor+ panels: surging topics, internet outages, service status, prediction markets. Server components. */
import { safeHttpUrl } from "@/lib/url";
import { ExternalLink, TrendingUp } from "lucide-react";
import Link from "next/link";
import { cn } from "@/components/ui/primitives";
import type { OutageView, StatusView } from "@/lib/signalQueries";
import { signalLabel, type Market, type Surge } from "@/lib/signals";

const LEVEL: Record<OutageView["level"], { label: string; cls: string; dot: string }> = {
  major: { label: "Major", cls: "text-bad", dot: "#ff5a6e" },
  moderate: { label: "Moderate", cls: "text-warn", dot: "#ffb020" },
  minor: { label: "Minor", cls: "text-ink-2", dot: "#9aa0aa" },
};

export function SurgeStrip({ surges }: { surges: Surge[] }) {
  if (!surges.length) return <p className="text-[13px] text-ink-2">Nothing is spiking — no term is suddenly in 3+ outlets compared with its usual week.</p>;
  return (
    <ul className="flex flex-wrap gap-2">
      {surges.map((s) => (
        <li key={s.term}>
          <Link
            href={`/news?q=${encodeURIComponent(s.term)}`}
            title={s.sample.map((x) => `${x.title} (${x.source})`).join("\n")}
            className="glass flex h-9 items-center gap-2 !rounded-full pl-2.5 pr-3 text-[13px] hover:bg-raised"
          >
            <TrendingUp size={14} className={s.kind === "tech" ? "text-accent" : s.kind === "world" ? "text-[#b18cff]" : "text-ink-2"} />
            <span>{s.term}</span>
            {s.related.length > 0 && <span className="max-w-40 truncate text-ink-3">· {s.related.slice(0, 2).join(" · ")}</span>}
            <span className="num text-[12px] text-ink-2">{s.outlets} outlets</span>
            <span className="num text-[11px] text-good">×{s.ratio >= 10 ? Math.round(s.ratio) : s.ratio.toFixed(1)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function OutageList({ outages, limit = 10, empty = "No country-level outages in the last 48 hours." }: { outages: OutageView[]; limit?: number; empty?: string }) {
  if (!outages.length) return <p className="text-[14px] text-ink-2">{empty}</p>;
  return (
    <ul className="flex flex-col divide-y divide-line">
      {outages.slice(0, limit).map((o) => (
        <li key={o.iso} className="flex items-center gap-3 py-2.5 first:pt-0">
          <span aria-hidden className="text-[20px] leading-none">{o.flag}</span>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-[14px]">
              <Link href={`/?country=${o.iso}`} scroll={false} className="truncate hover:underline">{o.name}</Link>
              {o.ongoing && <span className="flex shrink-0 items-center gap-1 rounded-full bg-chip px-1.5 text-[10px] text-ink"><span className="block size-1.5 rounded-full rx-pulse" style={{ background: LEVEL[o.level].dot }} />ongoing</span>}
            </p>
            <p className="truncate text-[12px] text-ink-2">{o.signals.map(signalLabel).join(", ")} · {o.ongoing ? `for ${o.hours}h` : `${o.hours}h, ended ${o.endedAgo}`}</p>
          </div>
          <span className={cn("shrink-0 text-[12px]", LEVEL[o.level].cls)}>{LEVEL[o.level].label}</span>
        </li>
      ))}
    </ul>
  );
}

const STATE: Record<StatusView["state"], { label: string; dot: string; cls: string }> = {
  ok: { label: "Operational", dot: "var(--good)", cls: "text-ink-2" },
  recovered: { label: "Recovered", dot: "#7fb8ff", cls: "text-ink-2" },
  degraded: { label: "Incident", dot: "var(--bad)", cls: "text-bad" },
};

export function StatusBoard({ services }: { services: StatusView[] }) {
  if (!services.length) return <p className="text-[14px] text-ink-2">No status yet. Run <code className="rounded bg-chip px-1.5 py-0.5">npm run worker -- --signals</code>.</p>;
  const order = { degraded: 0, recovered: 1, ok: 2 };
  const sorted = [...services].sort((a, b) => order[a.state] - order[b.state]);
  return (
    <ul className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
      {sorted.map((s) => {
        const inc = s.open[0] ?? (s.state === "recovered" ? s.last : null);
        return (
          <li key={s.id} className="flex min-w-0 items-start gap-3 border-t border-line py-2.5">
            <span aria-hidden className={cn("mt-[6px] block size-2.5 shrink-0 rounded-full", s.state === "degraded" && "rx-pulse")} style={{ background: s.error ? "var(--ink-3, #888)" : STATE[s.state].dot }} />
            <div className="min-w-0 flex-1">
              <p className="flex items-baseline justify-between gap-2 text-[14px]">
                <a href={safeHttpUrl(s.url) ?? "#"} target="_blank" rel="noreferrer noopener" className="truncate hover:underline">{s.name}</a>
                <span className={cn("shrink-0 text-[12px]", STATE[s.state].cls)}>{s.error ? "Unreachable" : STATE[s.state].label}</span>
              </p>
              {inc ? (
                <a href={safeHttpUrl(inc.url) ?? "#"} target="_blank" rel="noreferrer noopener" className="line-clamp-1 text-[12px] text-ink-2 hover:underline">
                  {inc.title} · {s.lastAgo}
                </a>
              ) : (
                <p className="text-[12px] text-ink-3">{s.last ? `last incident ${s.lastAgo} ago` : "no incidents this week"}</p>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

const pct = (p: number) => (p < 0.01 ? "<1%" : p > 0.99 ? ">99%" : `${Math.round(p * 100)}%`);
const usd = (n: number) => (n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${Math.round(n / 1e3)}K` : `$${n}`);

export function MarketCard({ m }: { m: Market }) {
  return (
    <li className="flex min-w-0 flex-col gap-2 border-t border-line py-3 first:border-t-0 first:pt-0">
      <a href={safeHttpUrl(m.url) ?? "#"} target="_blank" rel="noreferrer noopener" className="group flex items-start justify-between gap-2 text-[14px] leading-snug">
        <span className="line-clamp-2 group-hover:underline">{m.title}</span>
        <ExternalLink size={13} className="mt-1 shrink-0 text-ink-3" aria-hidden />
      </a>
      <ul className="flex flex-col gap-1.5" aria-label={m.ladder ? "Rungs, in order" : "Most likely outcomes"}>
        {m.outcomes.map((o) => (
          <li key={o.label} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
            <span className="truncate text-[12px] text-ink-2">{/^yes$/i.test(o.label) ? "Chance" : o.label}</span>
            <span className="num flex items-baseline gap-1.5 text-[13px]">
              {pct(o.p)}
              {o.change != null && Math.abs(o.change) >= 0.01 && (
                <span className={cn("text-[11px]", o.change > 0 ? "text-good" : "text-bad")}>{o.change > 0 ? "▲" : "▼"}{Math.round(Math.abs(o.change) * 100)}</span>
              )}
            </span>
            <span aria-hidden className="col-span-2 block h-1 overflow-hidden rounded-full bg-chip">
              <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.max(2, Math.round(o.p * 100))}%` }} />
            </span>
          </li>
        ))}
      </ul>
      <p className="num text-[11px] text-ink-3">{usd(m.volume24h)} traded 24h{m.endDate ? ` · resolves ${new Date(m.endDate).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}` : ""}</p>
    </li>
  );
}

export function MarketLanes({ lanes }: { lanes: { tag: string; label: string; markets: Market[] }[] }) {
  const any = lanes.some((l) => l.markets.length);
  if (!any) return <p className="text-[14px] text-ink-2">No markets yet. Run <code className="rounded bg-chip px-1.5 py-0.5">npm run worker -- --signals</code>.</p>;
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
      {lanes.map((l) => (
        <section key={l.tag} className="min-w-0" aria-labelledby={`lane-${l.tag}`}>
          <h3 id={`lane-${l.tag}`} className="mb-3 text-[13px] text-ink-2">{l.label}</h3>
          {l.markets.length ? <ul>{l.markets.map((m) => <MarketCard key={m.id} m={m} />)}</ul> : <p className="text-[13px] text-ink-3">Nothing active.</p>}
        </section>
      ))}
    </div>
  );
}
