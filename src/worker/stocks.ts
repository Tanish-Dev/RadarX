/**
 * Stock watcher (Twelve Data, free key in TWELVEDATA_API_KEY). Free plan: 800 credits/day, 8/minute,
 * 1 credit per symbol. Each check (every STOCK_INTERVAL_MIN, default 30) quotes the next 7 symbols in
 * rotation + fetches one symbol's 30-day history → ≤8 credits/run, ~390/day for 14 symbols.
 * Symbols the plan doesn't cover (e.g. NSE) are retried once a day, not every run.
 */
import { WATCHLIST, stockKey } from "../data/stocks";
import { db, kvGet, kvSet } from "../lib/db";
import { fetchJson } from "../lib/http";
import { parseQuotes, parseSeries, TwelveDataError } from "../lib/stocks";

const API = "https://api.twelvedata.com";
const INTERVAL_MS = (Number(process.env.STOCK_INTERVAL_MIN) || 30) * 60_000;
const PER_RUN = 7;
const DAY = 86_400_000;

export interface StockCheck {
  ok: number;
  failed: { key: string; error: string }[];
  series?: string;
  skipped?: "no-key" | "interval";
}

export async function checkStocks(opts: { force?: boolean; demo?: boolean } = {}): Promise<StockCheck | null> {
  const apiKey = opts.demo ? "demo" : process.env.TWELVEDATA_API_KEY;
  if (!apiKey) return null;
  const now = Date.now();
  if (!opts.force && now - ((await kvGet<number>("stocks_checked_at")) ?? 0) < INTERVAL_MS) return null;
  await kvSet("stocks_checked_at", now);
  const c = await db();

  // the demo key only serves AAPL
  const list = opts.demo ? WATCHLIST.filter((s) => s.symbol === "AAPL") : WATCHLIST;
  const skip = (await kvGet<Record<string, number>>("stocks_skip_until")) ?? {};
  const eligible = list.filter((s) => (skip[stockKey(s)] ?? 0) < now);
  const cursor = (await kvGet<number>("stocks_cursor")) ?? 0;
  const batch = Array.from({ length: Math.min(PER_RUN, eligible.length) }, (_, i) => eligible[(cursor + i) % eligible.length]);
  await kvSet("stocks_cursor", (cursor + batch.length) % Math.max(1, eligible.length));

  const res: StockCheck = { ok: 0, failed: [] };
  if (batch.length) {
    const keys = batch.map(stockKey);
    const { data } = await fetchJson(`${API}/quote?symbol=${encodeURIComponent(keys.join(","))}&apikey=${apiKey}`);
    const parsed = parseQuotes(data, keys);
    for (const [key, q] of parsed) {
      if (q instanceof Error) {
        const msg = q.message.slice(0, 200);
        res.failed.push({ key, error: msg });
        // plan/coverage errors won't fix themselves within the hour — retry daily to save credits
        if (q instanceof TwelveDataError || /plan|grow|pro|available|not found/i.test(msg)) skip[key] = now + DAY;
        await c.execute({ sql: `INSERT INTO stocks (key, error, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET error = excluded.error, updated_at = excluded.updated_at`, args: [key, msg, now] });
        continue;
      }
      res.ok++;
      delete skip[key];
      await c.batch(
        [
          {
            sql: `INSERT INTO stocks (key, name, exchange, currency, price, change, pct, prev_close, day_low, day_high, low52, high52, is_open, quote_at, updated_at, error)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
                  ON CONFLICT(key) DO UPDATE SET name = excluded.name, exchange = excluded.exchange, currency = excluded.currency, price = excluded.price,
                    change = excluded.change, pct = excluded.pct, prev_close = excluded.prev_close, day_low = excluded.day_low, day_high = excluded.day_high,
                    low52 = excluded.low52, high52 = excluded.high52, is_open = excluded.is_open, quote_at = excluded.quote_at, updated_at = excluded.updated_at, error = NULL`,
            args: [key, q.name, q.exchange, q.currency, q.price, q.change, q.pct, q.prevClose, q.low, q.high, q.low52, q.high52, q.isOpen ? 1 : 0, q.at, now],
          },
          // the latest quote is also today's (provisional) close for the sparkline
          { sql: `INSERT OR REPLACE INTO stock_history (key, day, close) VALUES (?, ?, ?)`, args: [key, q.day, q.price] },
        ],
        "write",
      );
    }
    await kvSet("stocks_skip_until", skip);
  }

  // one 30-day history per run, for the symbol whose history is stalest
  const seriesAt = (await kvGet<Record<string, number>>("stocks_series_at")) ?? {};
  const working = list.filter((s) => (skip[stockKey(s)] ?? 0) < now);
  const stale = working.map(stockKey).sort((a, b) => (seriesAt[a] ?? 0) - (seriesAt[b] ?? 0))[0];
  if (stale && now - (seriesAt[stale] ?? 0) > DAY) {
    try {
      const { data } = await fetchJson(`${API}/time_series?symbol=${encodeURIComponent(stale)}&interval=1day&outputsize=30&apikey=${apiKey}`);
      const pts = parseSeries(data);
      await c.batch(pts.map((p) => ({ sql: `INSERT OR REPLACE INTO stock_history (key, day, close) VALUES (?, ?, ?)`, args: [stale, p.day, p.close] })), "write");
      await c.execute({ sql: `DELETE FROM stock_history WHERE key = ? AND day < ?`, args: [stale, new Date(now - 60 * DAY).toISOString().slice(0, 10)] });
      res.series = stale;
    } catch (e) {
      res.failed.push({ key: `${stale} (history)`, error: e instanceof Error ? e.message.slice(0, 200) : String(e) });
    }
    seriesAt[stale] = now;
    await kvSet("stocks_series_at", seriesAt);
  }
  return res;
}
