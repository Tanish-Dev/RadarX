import { NextRequest } from "next/server";
import { afterEach, describe, expect, it } from "vitest";
import { middleware } from "../src/middleware";
import { safeHttpUrl } from "../src/lib/url";

const req = (auth?: string) => new NextRequest("https://radarx.example/settings", { headers: auth ? { authorization: auth } : {} });
const basic = (user: string, pass: string) => `Basic ${btoa(`${user}:${pass}`)}`;

describe("dashboard password gate", () => {
  afterEach(() => delete process.env.DASHBOARD_PASSWORD);

  it("is open when DASHBOARD_PASSWORD is unset (local dev)", () => {
    expect(middleware(req()).status).toBe(200);
  });

  it("challenges without / with wrong credentials, passes with the right one", () => {
    process.env.DASHBOARD_PASSWORD = "s3cret:with-colon";
    const none = middleware(req());
    expect(none.status).toBe(401);
    expect(none.headers.get("www-authenticate")).toMatch(/Basic/);
    expect(middleware(req(basic("me", "nope"))).status).toBe(401);
    expect(middleware(req("Basic !!!not-base64"))).toHaveProperty("status", 401);
    expect(middleware(req(basic("anyone", "s3cret:with-colon"))).status).toBe(200);
  });
});

describe("safeHttpUrl", () => {
  it("allows http(s) only", () => {
    expect(safeHttpUrl("https://boards.greenhouse.io/x/jobs/1")).toBe("https://boards.greenhouse.io/x/jobs/1");
    expect(safeHttpUrl("javascript:alert(1)")).toBeNull();
    expect(safeHttpUrl("data:text/html,hi")).toBeNull();
    expect(safeHttpUrl("not a url")).toBeNull();
    expect(safeHttpUrl(null)).toBeNull();
  });
});
