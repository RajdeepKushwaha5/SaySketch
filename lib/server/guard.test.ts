import { afterEach, describe, expect, it } from "vitest";
import { checkRateLimit, guardAIRequest, resetRateLimits } from "./guard";

const post = (body: string, ip = "1.2.3.4") => new Request("http://x/api", { method: "POST", body, headers: { "x-forwarded-for": `${ip}, 10.0.0.1` } });

afterEach(() => {
  resetRateLimits();
  delete process.env.AI_DISABLED;
});

describe("AI request guard", () => {
  it("limits each client per minute and recovers after the window", () => {
    for (let i = 0; i < 3; i++) expect(checkRateLimit("a", 1000, 3)).toBeNull();
    expect(checkRateLimit("a", 2000, 3)).toBe(59);
    expect(checkRateLimit("b", 2000, 3)).toBeNull();
    expect(checkRateLimit("a", 61_001, 3)).toBeNull();
  });
  it("honours the kill switch before reading the body", async () => {
    process.env.AI_DISABLED = "1";
    const result = await guardAIRequest(post("{}"));
    expect("error" in result && result.error.status).toBe(503);
  });
  it("rejects oversized and malformed bodies, passes valid JSON", async () => {
    const big = await guardAIRequest(post(JSON.stringify({ x: "y".repeat(70_000) })));
    expect("error" in big && big.error.status).toBe(413);
    const bad = await guardAIRequest(post("{nope"));
    expect("error" in bad && bad.error.status).toBe(400);
    expect(await guardAIRequest(post('{"ok":1}', "5.6.7.8"))).toEqual({ body: { ok: 1 } });
  });
  it("returns 429 with Retry-After once the client limit is reached", async () => {
    for (let i = 0; i < 10; i++) await guardAIRequest(post("{}", "9.9.9.9"));
    const result = await guardAIRequest(post("{}", "9.9.9.9"));
    expect("error" in result && result.error.status).toBe(429);
    expect("error" in result && result.error.headers.get("Retry-After")).toBeTruthy();
  });
});
