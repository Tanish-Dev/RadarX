import { describe, expect, it } from "vitest";
import { PROGRAMS } from "../src/data/programs";
import { extractDeadline, extractWatchLines, programStatus } from "../src/lib/programs";

const NOV17 = Date.UTC(2026, 10, 17, 6);

describe("program watcher", () => {
  it("keeps only keyword lines, deduped", () => {
    const html = `<h1>Summer Research</h1><p>Applications open on 1 Dec 2026</p><p>About us</p><li>Apply online</li><li>apply online</li><p>Last date: 31 January 2027</p>`;
    expect(extractWatchLines(html, ["apply", "application", "last date"])).toEqual([
      "Applications open on 1 Dec 2026",
      "Apply online",
      "Last date: 31 January 2027",
    ]);
  });

  it("reads deadlines in common Indian/English formats", () => {
    expect(new Date(extractDeadline(["Last date: 31 January 2027"], NOV17)!).toISOString().slice(0, 10)).toBe("2027-01-31");
    expect(new Date(extractDeadline(["Deadline – December 15, 2026"], NOV17)!).toISOString().slice(0, 10)).toBe("2026-12-15");
    expect(new Date(extractDeadline(["Apply by 05.12.2026"], NOV17)!).toISOString().slice(0, 10)).toBe("2026-12-05");
    expect(extractDeadline(["Last date: 1 March 2025"], NOV17)).toBeNull(); // past
    expect(extractDeadline(["Programme runs 1 June 2027"], NOV17)).toBeNull(); // not a deadline line
  });

  it("derives status from deadline, then the typical window", () => {
    expect(programStatus({ window: "rolling" }, null, NOV17).status).toBe("rolling");
    expect(programStatus({ window: { open: 11, close: 12 } }, null, NOV17)).toMatchObject({ status: "open" });
    expect(programStatus({ window: { open: 12, close: 1 } }, null, NOV17)).toMatchObject({ status: "soon", label: "Opens ~Dec" });
    expect(programStatus({ window: { open: 3, close: 4 } }, null, NOV17)).toMatchObject({ status: "closed", label: "Opens ~Mar" });
    expect(programStatus({ window: { open: 11, close: 2 } }, null, Date.UTC(2027, 0, 10))).toMatchObject({ status: "open" }); // wraps year
    expect(programStatus({ window: "rolling" }, NOV17 + 3 * 86_400_000, NOV17)).toMatchObject({ status: "closing", label: "Closes in 3 days" });
  });

  it("registry is well-formed", () => {
    const ids = new Set<string>();
    for (const p of PROGRAMS) {
      expect(ids.has(p.id), p.id).toBe(false);
      ids.add(p.id);
      expect(p.url).toMatch(/^https:\/\//);
      if (p.watch) expect(p.keywords.length, p.id).toBeGreaterThan(0);
    }
    expect(PROGRAMS.filter((p) => p.india).length).toBeGreaterThanOrEqual(15);
  });
});
