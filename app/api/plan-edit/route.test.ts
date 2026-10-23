import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const create = vi.fn();
vi.mock("@/lib/ai/llm", () => ({
  modelOptions: () => ({}),
  resolveClient: (config?: { apiKey?: string }) => ({ client: { chat: { completions: { create } } }, model: "m", serverFunded: !config?.apiKey }),
}));

const { POST } = await import("./route");
const { resetRateLimits } = await import("@/lib/server/guard");

const context = { nodes: [{ id: "api", label: "API" }, { id: "db", label: "DB" }], edges: [{ id: "e1", from: "api", to: "db", label: "" }], selected: ["api"] };
const call = (body: unknown) => POST(new Request("http://x/api/plan-edit", { method: "POST", body: JSON.stringify(body) }));
const reply = (content: string) => ({ choices: [{ message: { content } }] });

beforeEach(() => {
  process.env.GROQ_API_KEY = "test";
  resetRateLimits();
  create.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  delete process.env.GROQ_API_KEY;
  vi.restoreAllMocks();
});

describe("POST /api/plan-edit", () => {
  it("returns a validated proposal and sends no geometry to the model", async () => {
    create.mockResolvedValueOnce(reply('{"status":"proposal","operations":[{"type":"addNode","ref":"new-1","label":"Cache","near":"api"}]}'));
    const res = await call({ instruction: "add a cache", context: { ...context, nodes: [{ id: "api", label: "API", x: 5 }, { id: "db", label: "DB" }] } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "proposal", operations: [{ type: "addNode", ref: "new-1", label: "Cache", near: "api" }] });
    const sent = create.mock.calls[0][0];
    expect(JSON.stringify(sent.messages)).not.toContain('"x"');
    expect(sent.response_format).toEqual({ type: "json_object" });
  });

  it("retries once with the validation error, then succeeds", async () => {
    create
      .mockResolvedValueOnce(reply('{"status":"proposal","operations":[{"type":"removeNode","id":"ghost"}]}'))
      .mockResolvedValueOnce(reply('{"status":"no_change","reason":"Already there."}'));
    const res = await call({ instruction: "remove the cache", context });
    expect(await res.json()).toEqual({ status: "no_change", reason: "Already there." });
    const retry = create.mock.calls[1][0].messages.at(-1).content;
    expect(retry).toContain('Unknown node "ghost"');
  });

  it("gives up with 502 after two invalid replies", async () => {
    create.mockResolvedValue(reply("not json"));
    const res = await call({ instruction: "x", context });
    expect(res.status).toBe(502);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it.each([
    [{ instruction: "", context }, 400],
    [{ instruction: "x".repeat(2001), context }, 400],
    [{ instruction: "x", context: { nodes: [] } }, 400],
  ])("rejects bad requests before calling the model (%#)", async (body, status) => {
    expect((await call(body)).status).toBe(status);
    expect(create).not.toHaveBeenCalled();
  });

  it("reports a missing server key and a rejected personal key distinctly", async () => {
    delete process.env.GROQ_API_KEY;
    expect((await call({ instruction: "x", context })).status).toBe(503);
    create.mockRejectedValueOnce(Object.assign(new Error("Unauthorized"), { status: 401 }));
    const res = await call({ instruction: "x", context, providerConfig: { provider: "google", apiKey: "bad" } });
    expect(res.status).toBe(401);
    expect((await res.json()).error).toContain("API key was rejected");
    expect(create.mock.calls[0][0].response_format).toBeUndefined();
  });

  it("drops JSON mode once if the provider rejects it, without spending a validation retry", async () => {
    create
      .mockRejectedValueOnce(Object.assign(new Error("response_format not supported"), { status: 400 }))
      .mockResolvedValueOnce(reply('{"status":"no_change","reason":"Fine."}'));
    const res = await call({ instruction: "x", context });
    expect(res.status).toBe(200);
    expect(create.mock.calls[0][0].response_format).toEqual({ type: "json_object" });
    expect(create.mock.calls[1][0].response_format).toBeUndefined();
  });

  it("maps provider timeouts and rate limits to retryable errors", async () => {
    create.mockRejectedValueOnce(Object.assign(new Error("timed out"), { name: "APIConnectionTimeoutError" }));
    expect((await call({ instruction: "x", context })).status).toBe(504);
    create.mockRejectedValueOnce(Object.assign(new Error("busy"), { status: 429 }));
    expect((await call({ instruction: "x", context })).status).toBe(429);
  });
});
