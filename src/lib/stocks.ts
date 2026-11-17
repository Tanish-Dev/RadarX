/** Twelve Data response parsers (pure; tests/stocks.test.ts). Throw on unexpected shapes. */
export interface Quote {
  symbol: string;
  name: string;
  exchange: string;
  currency: string;
  price: number;
  change: number;
  pct: number;
  prevClose: number;
  open: number | null;
  high: number | null;
  low: number | null;
  low52: number | null;
  high52: number | null;
  isOpen: boolean;
  /** exchange time of the last trade, ms */
  at: number;
  /** trading day (exchange date) */
  day: string;
}

export class TwelveDataError extends Error {
  constructor(public code: number, message: string) {
    super(message);
  }
}

const num = (v: unknown) => (v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);

function errorOf(o: Record<string, unknown>) {
  if (o.status === "error" || (typeof o.code === "number" && o.code >= 400)) return new TwelveDataError(Number(o.code ?? 0), String(o.message ?? "error"));
  return null;
}

export function parseQuote(o: unknown): Quote {
  if (!o || typeof o !== "object") throw new Error("quote: not an object");
  const q = o as Record<string, any>;
  const err = errorOf(q);
  if (err) throw err;
  const price = num(q.close);
  if (!q.symbol || price == null) throw new Error("quote: missing symbol/close — unexpected shape");
  const prev = num(q.previous_close) ?? price;
  return {
    symbol: String(q.symbol),
    name: String(q.name ?? q.symbol),
    exchange: String(q.exchange ?? ""),
    currency: String(q.currency ?? "USD"),
    price,
    change: num(q.change) ?? price - prev,
    pct: num(q.percent_change) ?? (prev ? ((price - prev) / prev) * 100 : 0),
    prevClose: prev,
    open: num(q.open),
    high: num(q.high),
    low: num(q.low),
    low52: num(q.fifty_two_week?.low),
    high52: num(q.fifty_two_week?.high),
    isOpen: q.is_market_open === true,
    at: (num(q.last_quote_at) ?? num(q.timestamp) ?? Date.now() / 1000) * 1000,
    day: /^\d{4}-\d{2}-\d{2}/.test(String(q.datetime)) ? String(q.datetime).slice(0, 10) : new Date().toISOString().slice(0, 10),
  };
}

/**
 * Batch quote: one symbol → the quote object itself; several → { "AAPL": {...}, "TCS:NSE": {...} }.
 * Per-symbol errors come back inline and are returned as Errors, not thrown.
 */
export function parseQuotes(o: unknown, keys: string[]): Map<string, Quote | Error> {
  if (!o || typeof o !== "object") throw new Error("quotes: not an object");
  const top = errorOf(o as Record<string, unknown>);
  if (top) throw top;
  const out = new Map<string, Quote | Error>();
  if (keys.length === 1) {
    out.set(keys[0], parseQuote(o));
    return out;
  }
  for (const k of keys) {
    const v = (o as Record<string, unknown>)[k] ?? (o as Record<string, unknown>)[k.split(":")[0]];
    if (v == null) {
      out.set(k, new Error("missing from response"));
      continue;
    }
    try {
      out.set(k, parseQuote(v));
    } catch (e) {
      out.set(k, e instanceof Error ? e : new Error(String(e)));
    }
  }
  return out;
}

/** Daily closes, oldest first. */
export function parseSeries(o: unknown): { day: string; close: number }[] {
  if (!o || typeof o !== "object") throw new Error("series: not an object");
  const err = errorOf(o as Record<string, unknown>);
  if (err) throw err;
  const values = (o as { values?: unknown }).values;
  if (!Array.isArray(values)) throw new Error("series: no values — unexpected shape");
  return values
    .map((v: any) => ({ day: String(v.datetime).slice(0, 10), close: Number(v.close) }))
    .filter((v) => /^\d{4}-\d{2}-\d{2}$/.test(v.day) && Number.isFinite(v.close))
    .reverse();
}
