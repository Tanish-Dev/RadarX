/** Server reads for the stock watchlist. */
import "server-only";
import { WATCHLIST, stockKey, type Stock } from "../data/stocks";
import { db, kvGet } from "./db";
import { ago } from "./time";

export interface StockView extends Stock {
  key: string;
  price: number | null;
  change: number | null;
  pct: number | null;
  currency: string;
  low52: number | null;
  high52: number | null;
  isOpen: boolean;
  updated: string | null;
  error: string | null;
  /** daily closes, oldest first (≤30) */
  spark: number[];
}

export async function getStocks(): Promise<{ configured: boolean; items: StockView[]; lastCheck: string | null }> {
  const c = await db();
  const [rows, hist, last] = await Promise.all([
    c.execute(`SELECT * FROM stocks`),
    c.execute(`SELECT key, close FROM stock_history WHERE day >= date('now', '-45 day') ORDER BY day`),
    kvGet<number>("stocks_checked_at"),
  ]);
  const byKey = new Map(rows.rows.map((r) => [String(r.key), r]));
  const spark = new Map<string, number[]>();
  for (const h of hist.rows) (spark.get(String(h.key)) ?? spark.set(String(h.key), []).get(String(h.key))!).push(Number(h.close));
  const n = (v: unknown) => (v == null ? null : Number(v));
  const items = WATCHLIST.map((s) => {
    const key = stockKey(s);
    const r = byKey.get(key);
    return {
      ...s,
      key,
      price: n(r?.price),
      change: n(r?.change),
      pct: n(r?.pct),
      currency: String(r?.currency ?? (s.exchange === "NSE" ? "INR" : "USD")),
      low52: n(r?.low52),
      high52: n(r?.high52),
      isOpen: Number(r?.is_open ?? 0) === 1,
      updated: r?.updated_at == null ? null : ago(Number(r.updated_at)),
      error: r?.price == null && r?.error ? String(r.error) : null,
      spark: (spark.get(key) ?? []).slice(-30),
    };
  });
  return { configured: !!process.env.TWELVEDATA_API_KEY, items, lastCheck: last ? ago(last) : null };
}
