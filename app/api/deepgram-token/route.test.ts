import { afterEach, expect, it, vi } from "vitest";
import { GET } from "./route";
import { resetRateLimits } from "@/lib/server/guard";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); resetRateLimits(); });
it("does not mint keys when disabled", async () => {
  vi.stubEnv("DEEPGRAM_ENABLED", "");
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  expect((await GET(new Request("http://local/api/deepgram-token"))).status).toBe(404);
  expect(fetch).not.toHaveBeenCalled();
});
it("fails closed on shared limiter failure without reaching the speech provider", async () => {
  vi.stubEnv("DEEPGRAM_ENABLED", "1");
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.example");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "test");
  const fetch = vi.fn<(input: RequestInfo | URL) => Promise<Response>>(async () => new Response("down", { status: 503 })); vi.stubGlobal("fetch", fetch);
  expect((await GET(new Request("http://local/api/deepgram-token"))).status).toBe(503);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(String(fetch.mock.calls[0][0])).not.toContain("deepgram.com");
});
