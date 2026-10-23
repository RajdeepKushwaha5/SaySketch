import { afterEach, describe, expect, it, vi } from "vitest";
import { checkRateLimit, checkSharedRateLimit, guardAIRequest, resetRateLimits } from "./guard";

const post = (body: string, ip = "1.2.3.4") => new Request("http://x/api", { method: "POST", body, headers: { "x-forwarded-for": `${ip}, 10.0.0.1` } });

afterEach(() => {
  resetRateLimits();
  delete process.env.AI_DISABLED;
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  vi.unstubAllGlobals();
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
  it("limits actual UTF-8 bytes, not character count", async () => {
    const result = await guardAIRequest(post(JSON.stringify({ text: "界".repeat(24_000) })));
    expect("error" in result && result.error.status).toBe(413);
  });
  it("returns 429 with Retry-After once the client limit is reached", async () => {
    for (let i = 0; i < 10; i++) await guardAIRequest(post("{}", "9.9.9.9"));
    const result = await guardAIRequest(post("{}", "9.9.9.9"));
    expect("error" in result && result.error.status).toBe(429);
    expect("error" in result && result.error.headers.get("Retry-After")).toBeTruthy();
  });
});

describe("shared rate limit (Upstash REST)", () => {
  const configure = () => { process.env.UPSTASH_REDIS_REST_URL = "https://redis.example/"; process.env.UPSTASH_REDIS_REST_TOKEN = "t"; };
  const upstash = (count: number) => vi.fn(async () => new Response(JSON.stringify([{ result: count }, { result: 1 }])));

  it("is unused when not configured", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await checkSharedRateLimit("a")).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("counts in a per-minute key and limits above the threshold", async () => {
    configure();
    const fetchMock = upstash(3);
    vi.stubGlobal("fetch", fetchMock);
    expect(await checkSharedRateLimit("1.2.3.4", 120_000, 3)).toBeNull();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://redis.example/pipeline");
    expect(JSON.parse(String(init.body))[0]).toEqual(["INCR", "saysketch:rl:1.2.3.4:2"]);
    vi.stubGlobal("fetch", upstash(4));
    expect(await checkSharedRateLimit("1.2.3.4", 150_000, 3)).toBe(30);
  });
  it("fails closed when configured Upstash is unavailable", async () => {
    configure();
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("down"); }));
    expect(await checkSharedRateLimit("a")).toBeUndefined();
    const result = await guardAIRequest(post("{}", "7.7.7.7"));
    expect("error" in result && result.error.status).toBe(503);
  });
  it("fails closed for partial configuration and failed expiry", async () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://redis.example";
    let result = await guardAIRequest(post("{}"));
    expect("error" in result && result.error.status).toBe(503);
    configure();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify([{ result: 1 }, { error: "denied" }]))));
    result = await guardAIRequest(post("{}"));
    expect("error" in result && result.error.status).toBe(503);
  });
});
