import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { findSurges, parseAwsRss, parseGcpIncidents, parseIodaEvents, parsePolymarket, parseStatusAtom, simplifyCables, summarise, surgeTerms, type Headline } from "../src/lib/signals";

const raw = (n: string) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), "utf8");
const json = (n: string) => JSON.parse(raw(n));
const H = 3_600_000;

describe("IODA outages", () => {
  it("merges country events (real feed)", () => {
    const o = parseIodaEvents(json("ioda-events.json"), Date.parse("2026-11-19T08:40:00Z"));
    expect(o.length).toBeGreaterThan(3);
    expect(new Set(o.map((x) => x.iso)).size).toBe(o.length);
    for (const x of o) {
      expect(x.iso).toMatch(/^[A-Z]{2}$/);
      expect(x.end).toBeGreaterThanOrEqual(x.start);
      expect(x.signals.length).toBeGreaterThan(0);
    }
    expect(o.some((x) => x.ongoing)).toBe(true);
    // ongoing first
    const firstDone = o.findIndex((x) => !x.ongoing);
    if (firstDone > 0) expect(o.slice(firstDone).every((x) => !x.ongoing)).toBe(true);
  });
  it("throws on unexpected shapes", () => {
    expect(() => parseIodaEvents({})).toThrow();
    expect(() => parseIodaEvents({ data: [{ location: "country/IN" }] })).toThrow();
  });
});

describe("service status", () => {
  it("Statuspage Atom (GitHub)", () => {
    const now = Date.parse("2026-11-19T09:00:00Z");
    const inc = parseStatusAtom(raw("status-github.atom"), now);
    expect(inc.length).toBe(8);
    expect(inc[0].title).toMatch(/Copilot/);
    expect(inc[0].phase).toBe("resolved");
    expect(inc[0].open).toBe(false);
    const s = summarise({ id: "github", name: "GitHub", url: "", group: "dev" }, inc, now);
    expect(["ok", "recovered", "degraded"]).toContain(s.state);
    expect(s.last?.title).toBe(inc[0].title);
  });
  it("an unresolved fresh incident is open", () => {
    const xml = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><published>2026-11-19T08:00:00Z</published><link rel="alternate" href="https://x.test/i/1"/><title>API errors</title><content type="html">&lt;p&gt;Nov 19, 08:00 UTC &lt;strong&gt;Investigating&lt;/strong&gt; - We are looking into it.&lt;/p&gt;</content></entry></feed>`;
    const now = Date.parse("2026-11-19T09:00:00Z");
    const [i] = parseStatusAtom(xml, now);
    expect(i.phase).toBe("investigating");
    expect(i.open).toBe(true);
    expect(summarise({ id: "x", name: "X", url: "", group: "dev" }, [i], now).state).toBe("degraded");
    // the same entry 4 days later isn't live any more
    expect(parseStatusAtom(xml, now + 4 * 24 * H)[0].open).toBe(false);
  });
  it("Google Cloud incidents.json", () => {
    const inc = parseGcpIncidents(json("gcp-incidents.json"));
    expect(inc.length).toBe(4);
    expect(inc[0].url).toMatch(/^https:\/\/status\.cloud\.google\.com\/incidents\//);
    expect(inc.every((i) => !i.open)).toBe(true);
    expect(() => parseGcpIncidents({})).toThrow();
  });
  it("AWS RSS", () => {
    const inc = parseAwsRss(raw("status-aws.rss"), Date.parse("2026-11-19T09:00:00Z"));
    expect(inc.length).toBe(5);
    expect(inc[0].title).toMatch(/me-central-1/);
    expect(inc.every((i) => !i.open)).toBe(true); // months old
    expect(() => parseAwsRss("<html></html>")).toThrow();
  });
});

describe("Polymarket", () => {
  it("parses events, drops gossip", () => {
    const m = parsePolymarket(json("polymarket-events.json"), "ai");
    expect(m.length).toBeGreaterThan(4);
    expect(m.some((x) => /divorce|affair/i.test(x.title))).toBe(false);
    for (const x of m) {
      expect(x.url).toMatch(/^https:\/\/polymarket\.com\/event\//);
      expect(x.outcomes.length).toBeGreaterThan(0);
      expect(x.outcomes.length).toBeLessThanOrEqual(3);
      for (const o of x.outcomes) expect(o.p).toBeGreaterThanOrEqual(0), expect(o.p).toBeLessThanOrEqual(1);
    }
    // plain multi-outcome events: most likely first; ladders ("by date", "above $X"): rung order
    const multi = m.find((x) => x.outcomes.length > 1 && !x.ladder);
    if (multi) expect(multi.outcomes[0].p).toBeGreaterThanOrEqual(multi.outcomes[1].p);
    const geo = parsePolymarket(json("polymarket-events.json").slice(6), "geopolitics");
    const ru = geo.find((x) => /Russia x Ukraine/i.test(x.title))!;
    expect(ru.ladder).toBe(true);
    // earlier deadline first
    expect(ru.outcomes.map((o) => o.label)).toEqual(["December 31", "March 31, 2027"]);
    // a ladder whose every rung has closed is dropped, not shown empty
    expect(geo.some((x) => /ceasefire continues/i.test(x.title))).toBe(false);
  });
  it("throws on unexpected shapes", () => {
    expect(() => parsePolymarket({}, "ai")).toThrow();
    expect(() => parsePolymarket([{ title: "x" }], "ai")).toThrow();
  });
});

describe("cables", () => {
  it("simplifies the cable map", () => {
    const c = simplifyCables(json("cables-geo.json"));
    expect(c.features.length).toBe(6);
    for (const f of c.features) {
      expect(f.properties.name).toBeTruthy();
      expect(f.properties.color).toMatch(/^#/);
      for (const line of f.geometry.coordinates) for (const [x] of line) expect(Math.round(x * 10)).toBe(x * 10);
    }
    expect(() => simplifyCables({ type: "Feature" })).toThrow();
  });
});

describe("news surges", () => {
  const now = Date.parse("2026-11-19T12:00:00Z");
  const h = (source: string, title: string, hoursAgo: number, kind = "world"): Headline => ({ source, kind, title, url: `https://${source}.test/${encodeURIComponent(title)}/${hoursAgo}`, ts: now - hoursAgo * H });
  it("terms keep acronyms and drop stopwords", () => {
    const t = surgeTerms("Nvidia's GPU exports to China halted, officials say");
    expect(t.has("GPU")).toBe(true);
    expect(t.has("nvidia")).toBe(true);
    expect(t.has("export")).toBe(true);
    expect(t.has("officials")).toBe(false);
    expect(t.has("say")).toBe(false);
  });
  it("flags a term many outlets suddenly use, not a steady one", () => {
    const items: Headline[] = [
      h("bbc", "Volcano erupts near Reykjavik", 1),
      h("dw", "Iceland volcano eruption forces evacuations", 2),
      h("guardian", "Reykjavik airport shut as volcano erupts", 3),
      h("aljazeera", "Volcano in Iceland erupts again", 4),
      // "election" is in the news every day — no surge
      ...[1, 2, 3, 4].map((i) => h(["bbc", "dw", "guardian", "aljazeera"][i - 1], `Election campaign day ${i}`, i)),
      ...Array.from({ length: 28 }, (_, i) => h(["bbc", "dw", "guardian", "aljazeera"][i % 4], `Election rally number ${i}`, 7 + i * 6)),
    ];
    const s = findSurges(items, now);
    expect(s.map((x) => x.term)).toContain("volcano");
    expect(s.map((x) => x.term)).not.toContain("election");
    const v = s.find((x) => x.term === "volcano")!;
    expect(v.outlets).toBe(4);
    expect(v.sample.length).toBeLessThanOrEqual(3);
  });
  it("needs several outlets", () => {
    expect(findSurges([h("bbc", "Volcano erupts", 1), h("bbc", "Volcano erupts again", 2)], now)).toEqual([]);
  });
});
