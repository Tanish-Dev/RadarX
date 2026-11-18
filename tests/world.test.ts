import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { km, parseEonet, parseFxSeries, parseUsgs, reachKm } from "../src/lib/world";

const fx = (n: string) => JSON.parse(readFileSync(new URL(`./fixtures/${n}.json`, import.meta.url), "utf8"));

describe("world parsers", () => {
  it("USGS quakes (real feed)", () => {
    const q = parseUsgs(fx("usgs-quakes"));
    expect(q.length).toBeGreaterThan(0);
    for (const h of q) {
      expect(h.kind).toBe("quake");
      expect(h.mag).toBeGreaterThanOrEqual(4.5);
      expect(Math.abs(h.lat)).toBeLessThanOrEqual(90);
      expect(h.id).toMatch(/^usgs:/);
    }
  });
  it("EONET events (real feed)", () => {
    const e = parseEonet(fx("eonet-events"));
    expect(e.length).toBeGreaterThan(0);
    for (const h of e) {
      expect(Math.abs(h.lat)).toBeLessThanOrEqual(90);
      expect(Math.abs(h.lon)).toBeLessThanOrEqual(180);
    }
  });
  it("FX series", () => {
    const s = parseFxSeries(fx("frankfurter-series"));
    expect(s.base).toBe("USD");
    expect(s.rates.INR).toBeGreaterThan(50);
    expect(s.history.INR.length).toBeGreaterThan(10);
  });
  it("throws on unexpected shapes", () => {
    expect(() => parseUsgs({})).toThrow();
    expect(() => parseEonet({ nope: 1 })).toThrow();
    expect(() => parseFxSeries({ base: "USD" })).toThrow();
  });
  it("distance + reach", () => {
    expect(Math.round(km(18.52, 73.86, 19.08, 72.88))).toBeGreaterThan(100); // Pune–Mumbai ≈ 120 km
    expect(reachKm({ kind: "quake", mag: 6.5 })).toBeGreaterThan(reachKm({ kind: "quake", mag: 4.8 }));
  });
});
