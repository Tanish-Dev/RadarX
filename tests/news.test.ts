import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isIndiaPlace } from "../src/data/news";
import { clusterNews, locate, newsId, parseFeed, storyScore, titleTokens, topicsFor, type FeedItem } from "../src/lib/news";

const fx = (name: string) => readFileSync(new URL(`./fixtures/${name}.xml`, import.meta.url), "utf8");

function expectValid(items: FeedItem[], n = 3) {
  expect(items).toHaveLength(n);
  for (const it of items) {
    expect(it.title.length).toBeGreaterThan(5);
    expect(it.title).not.toMatch(/<!\[CDATA|<\/?[a-z]/i);
    expect(it.url).toMatch(/^https?:\/\//);
    expect(it.publishedAt).toBeGreaterThan(Date.UTC(2026, 0, 1));
  }
}

describe("parseFeed", () => {
  it("RSS 2.0 with media:thumbnail (BBC)", () => {
    const items = parseFeed(fx("news-bbc-rss"));
    expectValid(items);
    expect(items[0].title).toContain("Crimea bridge");
    expect(items[0].image).toMatch(/^https:\/\/ichef\.bbci\.co\.uk\//);
    expect(items[0].url).not.toContain("&amp;");
  });

  it("Atom (The Verge): alternate link, published date, html summary, term categories", () => {
    const items = parseFeed(fx("news-verge-atom"));
    expectValid(items);
    expect(items[0].url).toMatch(/^https:\/\/www\.theverge\.com\//);
    expect(items[0].categories).toContain("Drones");
    expect(items[0].summary).not.toMatch(/<[a-z]/i);
  });

  it("RSS 1.0 / RDF with dc:date (DW)", () => {
    const items = parseFeed(fx("news-dw-rdf"));
    expectValid(items);
    expect(items[1].title).toBe("Students' List candidates take seats as Serbian parliament opens");
  });

  it("hnrss: points parsed, link/comment boilerplate not used as a summary", () => {
    const items = parseFeed(fx("news-hn-rss"));
    expectValid(items);
    expect(items[0].points).toBe(84);
    expect(items[0].summary).toBe("");
  });

  it("entity-escaped HTML descriptions + media:content (Guardian)", () => {
    const items = parseFeed(fx("news-guardian-rss"));
    expectValid(items);
    expect(items[0].summary).toMatch(/^Germany, Austria/);
    expect(items[0].summary).not.toMatch(/&lt;|<p>/);
    expect(items[0].image).toMatch(/^https:\/\//);
  });

  it("enclosure image + IST offset dates (ET Tech)", () => {
    const items = parseFeed(fx("news-et-rss"));
    expectValid(items);
    expect(items[0].image).toMatch(/^https:\/\/img\.etimg\.com\//);
    expect(items[0].publishedAt).toBe(Date.parse("Tue, 17 Nov 2026 13:26:03 +0530"));
  });

  it("throws on things that aren't feeds", () => {
    expect(() => parseFeed("<!doctype html><html><body>Access denied</body></html>")).toThrow();
    expect(() => parseFeed('{"items":[]}')).toThrow();
    expect(() => parseFeed("<rss><channel><item><foo/></item></channel></rss>")).toThrow(/unexpected shape/);
  });

  it("ids ignore tracking params", () => {
    expect(newsId("https://x.com/a?at_medium=RSS")).toBe(newsId("https://x.com/a"));
  });
});

describe("locate", () => {
  const at = (title: string, summary = "", kind: "tech" | "world" = "world") => locate(title, summary, kind)?.place ?? null;

  it("countries, demonyms, capitals and hotspots", () => {
    expect(at("Putin's Crimea bridge partly collapses as Zelensky hails attack by Ukraine")).toBe("Crimea");
    expect(at("Bahrain sentences 64 Shias to life on terror charges")).toBe("Bahrain");
    expect(at("US moves to cut China's remote access to AI chips")).toBe("United States");
    expect(at("What to know about the delays affecting major U.S. banks")).toBe("United States");
    expect(at("Kim Jong Un tours North Korea ski resort")).toBe("North Korea");
    expect(at("Papua New Guinea floods displace thousands")).toBe("Papua New Guinea");
  });

  it("whole words only, case-sensitive", () => {
    expect(at("A woman in Oman")).toBe("Oman");
    expect(at("Romanian woman wins award")).toBe("Romania");
    expect(at("us and them")).toBeNull(); // lowercase "us" isn't the US
    expect(at("Nigerian airport arrest")).toBe("Nigeria");
    expect(at("Niger junta")).toBe("Niger");
  });

  it("cities from the job geocoder when no country is named", () => {
    expect(at("Uber and Zipline's drone delivery service takes flight in Houston", "", "tech")).toBe("Houston");
  });

  it("tech company → HQ only for tech stories, and only after places", () => {
    expect(at("Alibaba unveils new flagship AI model", "", "tech")).toBe("Hangzhou");
    expect(at("Meta tuned Instagram to curb violent content in India", "", "tech")).toBe("India");
    expect(at("Alibaba unveils new flagship AI model", "", "world")).toBeNull();
    expect(at("California sues OpenAI over rogue AI hacking", "", "tech")).toBe("California");
  });

  it("India: states, cities and institutions — not neighbours in India's bounding box", () => {
    expect(at("Amaravati builds indigenous quantum tech stack")).toBe("Andhra Pradesh");
    expect(at("Calicut varsity in Keralam tightens grip")).toBe("Kerala");
    expect(locate("ISRO readies next launch", "", "tech")?.india).toBe(true);
    expect(locate("Pakistan floods", "", "world")?.india).toBe(false);
    expect(locate("Kathmandu protests", "", "world")?.india).toBe(false);
    expect(isIndiaPlace("Telangana")).toBe(true);
  });

  it("falls back to the summary", () => {
    expect(at("Guterres calls for ban on killer robots", "Speaking in Geneva, the UN chief said")).toBe("Switzerland");
  });
});

describe("topics", () => {
  it("tags tech and world stories", () => {
    expect(topicsFor("tech", "Cybersecurity AI startup Corma reaches $1B valuation", "raised a $125 million Series A")).toEqual(expect.arrayContaining(["ai", "funding"]));
    expect(topicsFor("tech", "Company X lays off 1,200 employees", "")).toContain("layoffs");
    expect(topicsFor("world", "Ukraine hits Russia's Crimea bridge in 1,300-drone barrage", "")).toContain("conflict");
    expect(topicsFor("tech", "Nvidia shares slightly up ahead of earnings", "")).toContain("chips");
  });
});

describe("clusterNews", () => {
  const H = 3_600_000, t = Date.UTC(2026, 10, 17);
  const items = [
    { id: "a", source: "bbc-world", kind: "world" as const, title: "Ukraine hits Russia's Crimea bridge in drone barrage", ts: t },
    { id: "b", source: "guardian", kind: "world" as const, title: "Crimea bridge 'no longer usable' after Ukraine drone strike", ts: t + 2 * H },
    { id: "c", source: "aljazeera", kind: "world" as const, title: "Ukrainian drones hit Kerch bridge linking Russia and Crimea", ts: t + 3 * H },
    { id: "d", source: "dw", kind: "world" as const, title: "Guinea jails 200 in gold mining crackdown", ts: t + H },
    { id: "e", source: "bbc-world", kind: "world" as const, title: "Crimea bridge drone attack: what we know", ts: t + 4 * H }, // same outlet as a — joins via b/c
    { id: "f", source: "npr", kind: "world" as const, title: "Ukraine Crimea bridge drone barrage", ts: t + 60 * H }, // too late
  ];

  it("groups the same story across outlets under the earliest item", () => {
    const cl = clusterNews(items);
    expect(cl.get("b")).toBe("a");
    expect(cl.get("c")).toBe("a");
    expect(cl.get("d")).toBe("d");
    expect(cl.get("f")).toBe("f");
  });

  it("tokens drop stop words and plurals", () => {
    expect([...titleTokens("The drones hit Russia's bridges")]).toEqual(["drone", "hit", "russia", "bridge"]);
  });

  it("score: coverage beats recency, age decays", () => {
    expect(storyScore(4, null, 10)).toBeGreaterThan(storyScore(1, null, 0));
    expect(storyScore(1, null, 1)).toBeGreaterThan(storyScore(1, null, 20));
  });
});
