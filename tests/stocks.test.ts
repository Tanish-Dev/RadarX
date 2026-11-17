import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { stockKey, WATCHLIST } from "../src/data/stocks";
import { parseQuote, parseQuotes, parseSeries, TwelveDataError } from "../src/lib/stocks";

const fx = (n: string) => JSON.parse(readFileSync(new URL(`./fixtures/${n}.json`, import.meta.url), "utf8"));

describe("Twelve Data parsers", () => {
  it("quote (real AAPL response)", () => {
    const q = parseQuote(fx("twelvedata-quote"));
    expect(q.symbol).toBe("AAPL");
    expect(q.currency).toBe("USD");
    expect(q.price).toBeGreaterThan(0);
    expect(q.low52).toBeLessThan(q.high52!);
    expect(q.day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Math.abs(q.change - (q.price - q.prevClose))).toBeLessThan(0.05);
  });

  it("batch: keyed by symbol, per-symbol errors returned not thrown", () => {
    const one = fx("twelvedata-quote");
    const batch = { AAPL: one, "TCS:NSE": { code: 404, message: "symbol not available on your plan", status: "error" } };
    const m = parseQuotes(batch, ["AAPL", "TCS:NSE"]);
    expect((m.get("AAPL") as { price: number }).price).toBe(Number(one.close));
    expect(m.get("TCS:NSE")).toBeInstanceOf(TwelveDataError);
  });

  it("top-level API errors throw (bad key, rate limit)", () => {
    expect(() => parseQuotes({ code: 401, message: "bad key", status: "error" }, ["AAPL", "MSFT"])).toThrow(TwelveDataError);
    expect(() => parseQuote({ foo: 1 })).toThrow(/unexpected shape/);
  });

  it("series: oldest first, numeric closes", () => {
    const s = parseSeries(fx("twelvedata-series"));
    expect(s.length).toBeGreaterThan(10);
    expect(s[0].day < s[s.length - 1].day).toBe(true);
    expect(s.every((p) => p.close > 0)).toBe(true);
    expect(() => parseSeries({ meta: {} })).toThrow();
  });

  it("watchlist keys are unique and fit the free plan's 8/minute", () => {
    const keys = WATCHLIST.map(stockKey);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toContain("TCS:NSE");
  });
});
