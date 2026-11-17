import { ArrowDownRight, ArrowUpRight, KeyRound } from "lucide-react";
import Link from "next/link";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { cn } from "@/components/ui/primitives";
import type { StockView } from "@/lib/stockQueries";

const money = (v: number, cur: string) =>
  new Intl.NumberFormat(cur === "INR" ? "en-IN" : "en-US", { style: "currency", currency: cur, maximumFractionDigits: v >= 1000 ? 0 : 2 }).format(v);

/** 30-day close line, scaled to its own range; coordinates rounded (SSR/CSR float mismatch). */
function Spark({ values, up, w = 72, h = 26, className }: { values: number[]; up: boolean; w?: number; h?: number; className?: string }) {
  if (values.length < 2) return <span className={cn("inline-block", className)} style={{ width: w, height: h }} />;
  const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * w).toFixed(1)},${(h - 2 - ((v - min) / span) * (h - 4)).toFixed(1)}`);
  const id = `g${Math.round(values[0] * 100)}${values.length}${up ? 1 : 0}`;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className={cn("overflow-visible", up ? "text-good" : "text-bad", className)} aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="currentColor" stopOpacity=".28" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${h} ${pts.join(" ")} ${w},${h}`} fill={`url(#${id})`} />
      <polyline points={pts.join(" ")} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function Pct({ pct, className }: { pct: number | null; className?: string }) {
  if (pct == null) return <span className={cn("text-ink-3", className)}>—</span>;
  const up = pct >= 0;
  return (
    <span className={cn("num inline-flex items-center gap-0.5", up ? "text-good" : "text-bad", className)}>
      {up ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
      {Math.abs(pct).toFixed(2)}%
    </span>
  );
}

/** Home: one dense horizontal strip of the watchlist. */
export function StockStrip({ items, configured }: { items: StockView[]; configured: boolean }) {
  const live = items.filter((s) => s.price != null);
  return (
    <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0">
      {live.map((s) => {
        const up = (s.pct ?? 0) >= 0;
        return (
          <Link key={s.key} href="/market#stocks" className="card flex shrink-0 items-center gap-2.5 !rounded-[14px] px-3 py-2 hover:bg-raised">
            <CompanyLogo name={s.name} domain={s.domain} size={22} />
            <span className="flex flex-col leading-tight">
              <span className="text-[12px]">{s.symbol}</span>
              <span className="num text-[12px] text-ink-2">{money(s.price!, s.currency)}</span>
            </span>
            <Spark values={s.spark} up={s.spark.length > 1 ? s.spark[s.spark.length - 1] >= s.spark[0] : up} w={48} h={22} />
            <Pct pct={s.pct} className="text-[12px]" />
          </Link>
        );
      })}
      {!configured && (
        <Link href="/market#stocks" className="flex shrink-0 items-center gap-2 rounded-[14px] border border-dashed border-line px-4 py-2 text-[12px] text-ink-2 hover:text-ink">
          <KeyRound size={14} /> Add a free Twelve Data key to track all {items.length} stocks →
        </Link>
      )}
    </div>
  );
}

/** Market page card: price, day move, 30-day sparkline, 52-week range. */
export function StockCard({ s }: { s: StockView }) {
  const up = (s.pct ?? 0) >= 0;
  const range = s.low52 != null && s.high52 != null && s.price != null && s.high52 > s.low52 ? (s.price - s.low52) / (s.high52 - s.low52) : null;
  return (
    <article className="card flex min-w-0 flex-col gap-3 p-4">
      <header className="flex items-center gap-2.5">
        <CompanyLogo name={s.name} domain={s.domain} size={28} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px]">{s.name}</span>
          <span className="flex items-center gap-1.5 text-[11px] text-ink-2">
            {s.symbol}
            {s.exchange ? ` · ${s.exchange}` : ""}
            {s.price != null && <span className={cn("size-1.5 rounded-full", s.isOpen ? "bg-good" : "bg-ink-3")} title={s.isOpen ? "Market open" : "Market closed"} />}
          </span>
        </span>
      </header>
      {s.price != null ? (
        <>
          <div className="flex items-end justify-between gap-2">
            <span className="flex flex-col">
              <span className="num text-[22px] font-light leading-none tracking-[-0.03em]">{money(s.price, s.currency)}</span>
              <span className="mt-1 flex items-center gap-1.5 text-[12px]">
                <Pct pct={s.pct} />
                {s.change != null && <span className="num text-ink-3">{s.change >= 0 ? "+" : "−"}{money(Math.abs(s.change), s.currency)}</span>}
              </span>
            </span>
            <Spark values={s.spark} up={s.spark.length > 1 ? s.spark[s.spark.length - 1] >= s.spark[0] : up} w={84} h={34} />
          </div>
          {range != null && (
            <div className="flex flex-col gap-1">
              <div className="relative h-1 rounded-full bg-raised">
                <span className="absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink" style={{ left: `${Math.round(range * 100)}%` }} />
              </div>
              <div className="num flex justify-between text-[10px] text-ink-3">
                <span>52w {money(s.low52!, s.currency)}</span>
                <span>{money(s.high52!, s.currency)}</span>
              </div>
            </div>
          )}
          <span className="text-[10px] text-ink-3">updated {s.updated}</span>
        </>
      ) : (
        <p className="text-[12px] text-ink-3">
          {s.error
            ? /plan|grow|pro\b/i.test(s.error)
              ? "Not covered by Twelve Data's free plan — retried daily."
              : `Unavailable: ${s.error.replace(/\*\*/g, "").slice(0, 80)}`
            : "Waiting for the first quote…"}
        </p>
      )}
    </article>
  );
}

/** Hero widget: biggest movers today, one dense row each. */
export function StockMini({ items, configured, limit = 5 }: { items: StockView[]; configured: boolean; limit?: number }) {
  const live = items.filter((s) => s.price != null).sort((a, b) => Math.abs(b.pct ?? 0) - Math.abs(a.pct ?? 0)).slice(0, limit);
  return (
    <div className="flex flex-col">
      {live.map((s) => (
        <Link key={s.key} href="/market#stocks" className="grid grid-cols-[18px_minmax(0,1fr)_48px_minmax(0,72px)_58px] items-center gap-2 border-t border-line py-1.5 text-[12px] first:border-t-0 hover:text-ink">
          <CompanyLogo name={s.name} domain={s.domain} size={18} />
          <span className="truncate">
            {s.symbol}
            <span className="ml-1 text-[11px] text-ink-3">{s.name.replace(/ \(ADR\)$/, "")}</span>
          </span>
          <Spark values={s.spark} up={s.spark.length > 1 ? s.spark[s.spark.length - 1] >= s.spark[0] : (s.pct ?? 0) >= 0} w={48} h={18} />
          <span className="num truncate text-right">{money(s.price!, s.currency)}</span>
          <Pct pct={s.pct} className="justify-end text-[11px]" />
        </Link>
      ))}
      {!configured && (
        <Link href="/market#stocks" className="mt-1 flex items-center gap-1.5 rounded-[10px] bg-raised/70 px-3 py-2 text-[11px] text-ink-2 hover:bg-chip hover:text-ink">
          <KeyRound size={12} /> Add a free Twelve Data key to track all {items.length} →
        </Link>
      )}
      {configured && !live.length && <p className="text-[12px] text-ink-3">Waiting for the first quotes…</p>}
    </div>
  );
}
