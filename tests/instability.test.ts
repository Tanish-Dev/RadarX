import { describe, expect, it } from "vitest";
import { countryInText, countryOfLocation, countryOfPoint } from "../src/data/countries";
import { geocode } from "../src/data/cities";
import { bandOf, hazardWeight, isUnrest, scoreOf, storyWeight } from "../src/lib/instability";

describe("countries", () => {
  it("resolves points to the smallest containing box", () => {
    expect(countryOfPoint(1.35, 103.82)?.iso).toBe("SG");
    expect(countryOfPoint(18.52, 73.86)?.iso).toBe("IN"); // Pune
    expect(countryOfPoint(31.77, 35.21)?.iso).toBe("IL"); // Jerusalem
    expect(countryOfPoint(37.77, -122.42)?.iso).toBe("US");
    expect(countryOfPoint(0, -30)).toBeNull(); // mid-Atlantic
  });
  it("reads countries from location strings", () => {
    expect(countryInText("Berlin, Germany")?.iso).toBe("DE");
    expect(countryInText("Remote - USA")?.iso).toBe("US");
    expect(countryInText("Indianapolis, IN")).toBeNull(); // "indiana" must not match India
    expect(countryOfLocation("Bengaluru", geocode)?.iso).toBe("IN");
    expect(countryOfLocation("Remote", geocode)).toBeNull();
  });
});

describe("instability index", () => {
  it("is monotonic and banded", () => {
    const quiet = scoreOf({ unrest: 0, hazard: 0, attention: 1 });
    const hot = scoreOf({ unrest: 25, hazard: 1, attention: 30 });
    expect(hot.total).toBeGreaterThan(quiet.total);
    expect(quiet.band).toBe("low");
    expect(["high", "critical"]).toContain(hot.band);
    expect(scoreOf({ unrest: 1e6, hazard: 1e6, attention: 1e6 }).total).toBe(100);
    expect(bandOf(50)).toBe("elevated");
  });
  it("classifies headlines + weights", () => {
    expect(isUnrest("Missile strike kills 12 as ceasefire collapses")).toBe(true);
    expect(isUnrest("OpenAI launches new model")).toBe(false);
    expect(isUnrest("Police arrest four; 12 killed in road accident")).toBe(false);
    expect(storyWeight(3)).toBe(2);
    expect(hazardWeight("quake", 7.1)).toBeGreaterThan(hazardWeight("quake", 5.1));
  });
});
