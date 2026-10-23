// Live model evaluation (W08). Spends provider credits, so it only runs with LIVE_EVAL=1:
//   LIVE_EVAL=1 npx vitest run app/api/plan-edit/live.test.ts
// Reads GROQ_API_KEY / GROQ_MODEL from .env.local. Results are printed, not tuned to.
import { mkdirSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildPatch } from "@/lib/scene/patch";
import type { SceneOperation } from "@/lib/scene/patch";
import type { ExcalidrawElement } from "@/types/diagram";

const live = process.env.LIVE_EVAL === "1";

const node = (id: string, x: number, label: string): ExcalidrawElement[] => [
  { id, type: "rectangle", x, y: 0, width: 160, height: 70, boundElements: [{ id: `${id}-t`, type: "text" }] },
  { id: `${id}-t`, type: "text", containerId: id, text: label, originalText: label, fontSize: 16, width: 60, height: 20, x: x + 50, y: 25 },
];
const arrow = (id: string, from: string, to: string): ExcalidrawElement => ({ id, type: "arrow", x: 0, y: 35, points: [[0, 0], [1, 0]], startBinding: { elementId: from }, endBinding: { elementId: to } });
const scene: ExcalidrawElement[] = [...node("web", 0, "Web App"), ...node("api", 300, "API"), ...node("db", 600, "Database"), arrow("e1", "web", "api"), arrow("e2", "api", "db")];
const context = {
  nodes: [{ id: "web", label: "Web App" }, { id: "api", label: "API" }, { id: "db", label: "Database" }],
  edges: [{ id: "e1", from: "web", to: "api", label: "" }, { id: "e2", from: "api", to: "db", label: "" }],
};

type Plan = { status: string; operations?: SceneOperation[] };
const has = (plan: Plan, type: string, test: (op: Record<string, unknown>) => boolean = () => true) =>
  plan.operations?.some(op => op.type === type && test(op as unknown as Record<string, unknown>)) ?? false;
const label = (text: string) => (op: Record<string, unknown>) => String(op.label ?? "").toLowerCase().includes(text);

const connects = (p: Plan, ref: (op: Record<string, unknown>) => boolean) => {
  const refs = (p.operations ?? []).filter(op => op.type === "addNode" && ref(op as unknown as Record<string, unknown>)).map(op => (op as { ref: string }).ref);
  return refs.length > 0 && refs.every(r => has(p, "addEdge", op => op.from === r || op.to === r));
};

const cases: { say: string; selected?: string[]; isolatedRedis?: boolean; expect: (p: Plan) => boolean }[] = [
  // from a real dictated session: completeness, connections, hosting, CI/CD, replacement
  { say: "and we need Elasticsearch for search, and let's just host the entire backend on AWS", expect: p => connects(p, label("elastic")) && connects(p, label("aws")) },
  { say: "actually no, we better use MongoDB instead of the database because the data is very unstructured", expect: p => has(p, "updateNode", op => op.id === "db" && label("mongo")(op)) && !has(p, "addNode", label("mongo")) },
  { say: "yo, by the way, can you host the frontend on Vercel and also use GitLab for CI/CD", expect: p => connects(p, label("vercel")) && connects(p, label("gitlab")) },
  { say: "connect everything properly", isolatedRedis: true, expect: p => has(p, "addEdge", op => op.from === "redis" || op.to === "redis") },
  { say: "add a redis cache next to the API and connect the API to it", expect: p => has(p, "addNode", label("redis")) && has(p, "addEdge", op => op.from === "api") },
  { say: "rename the database to Postgres", expect: p => has(p, "updateNode", op => op.id === "db" && label("postgres")(op)) },
  { say: "call this one, um, Primary DB", selected: ["db"], expect: p => has(p, "updateNode", op => op.id === "db" && label("primary")(op)) },
  { say: "remove the connection between the web app and the API", expect: p => has(p, "removeEdge", op => op.id === "e1") && (p.operations?.length ?? 0) === 1 },
  { say: "put a queue after the API, no wait, after the database", expect: p => has(p, "addNode", op => label("queue")(op) && (op.near === "db" || op.near === undefined)) && !has(p, "addNode", op => op.near === "api") && !has(p, "removeEdge") },
  { say: "delete the database", expect: p => has(p, "removeNode", op => op.id === "db") },
  { say: "add a load balancer in front of the web app", expect: p => has(p, "addNode", label("load")) && has(p, "addEdge", op => op.to === "web") },
  { say: "connect this to the database", selected: ["web"], expect: p => has(p, "addEdge", op => op.from === "web" && op.to === "db") },
  // held out from prompt tuning (added after the first live run)
  { say: "add an auth service, sorry, I mean a billing service, next to the API", expect: p => has(p, "addNode", label("billing")) && !has(p, "addNode", label("auth")) && !has(p, "removeEdge") },
  { say: "insert a cache between the API and the database", expect: p => has(p, "addNode", label("cache")) && has(p, "addEdge", op => op.from === "api") && has(p, "addEdge", op => op.to === "db") },
  { say: "move the API over to the left a bit", expect: p => p.status === "clarification" },
  { say: "make sure the API talks to the database", expect: p => p.status === "no_change" },
];

describe.skipIf(!live)("live planner evaluation", () => {
  it("plans dictation-style instructions that the engine can apply", async () => {
    const { POST } = await import("./route");
    const rows: string[] = [];
    let correct = 0;
    for (const c of cases) {
      // pace calls under free-plan tokens-per-minute so the run measures the model, not the limiter
      if (rows.length) await new Promise(resolve => setTimeout(resolve, Number(process.env.LIVE_EVAL_DELAY_MS ?? 15_000)));
      const res = await POST(new Request("http://x/api/plan-edit", {
        method: "POST",
        body: JSON.stringify({ instruction: c.say, context: c.isolatedRedis
          ? { ...context, nodes: [...context.nodes, { id: "redis", label: "Redis" }], selected: [] }
          : { ...context, selected: c.selected ?? [] } }),
        headers: { "x-forwarded-for": `eval-${rows.length}` },
      }));
      const plan = (await res.json()) as Plan & { error?: string };
      let applies = "n/a";
      if (plan.status === "proposal") {
        try { buildPatch(c.isolatedRedis ? [...scene, ...node("redis", 900, "Redis")] : scene, plan.operations); applies = "yes"; } catch (err) { applies = `no: ${(err as Error).message}`; }
      }
      const ok = res.ok && c.expect(plan) && (applies === "yes" || applies === "n/a");
      if (ok) correct++;
      rows.push(`${ok ? "PASS" : "FAIL"} | ${res.status} | ${c.say} | ${plan.status ?? plan.error} | applies: ${applies} | ${JSON.stringify(plan.operations ?? "")}`);
      expect(res.status).toBeLessThan(500); // infrastructure must work; accuracy is reported below
    }
    const report = `Live planner ${new Date().toISOString()}: ${correct}/${cases.length} correct (model: ${process.env.GROQ_MODEL || "openai/gpt-oss-120b"})\n${rows.join("\n")}\n`;
    console.log(`\n${report}`);
    mkdirSync("test-results", { recursive: true });
    writeFileSync("test-results/live-eval.txt", report);
  }, 300_000);
});
