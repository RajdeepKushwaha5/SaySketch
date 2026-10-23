import { describe, expect, it } from "vitest";
import { buildPlannerContext } from "@/lib/ai/plan";
import { buildPatch } from "@/lib/scene/patch";
import { reconcileScene } from "@/lib/scene/reconcile";
import type { ExcalidrawElement } from "@/types/diagram";

// Explicit opt-in: three real requests, sequentially applied to the same evolving scene.
describe.skipIf(process.env.LIVE_EVAL !== "1")("e-commerce spoken sequence", () => {
  it("corrects the database and connects backend dependencies, hosting and deployment", async () => {
    const { POST } = await import("./route");
    let scene: ExcalidrawElement[] = ["Astro", "Cloudflare", "GraphQL", "Spring Boot", "Postgres"].flatMap((label, i) => [
      { id: `n${i}`, type: "rectangle", x: i * 280, y: 0, width: 160, height: 70, boundElements: [{ id: `t${i}`, type: "text" }] },
      { id: `t${i}`, type: "text", text: label, originalText: label, containerId: `n${i}`, x: i * 280 + 10, y: 20, width: 140, height: 25, fontSize: 15 },
      ...(i ? [{ id: `e${i}`, type: "arrow", startBinding: { elementId: `n${i - 1}` }, endBinding: { elementId: `n${i}` }, points: [[0, 0], [120, 0]], x: i * 280 - 120, y: 35 }] : []),
    ]);
    const history = ["Astro goes through Cloudflare to GraphQL. GraphQL calls Spring Boot for the backend. The backend writes to Postgres."];
    const instructions = [
      "Actually no, we better use MongoDB because the data is very unstructured.",
      "Spring Boot pushes orders into RabbitMQ for async stuff. Stripe handles payments. We need Elasticsearch for the backend as well. Host the backend on AWS and add GCS as storage.",
      "Host the frontend on Vercel and use GitLab for CI/CD.",
    ];
    for (const [i, instruction] of instructions.entries()) {
      if (i) await new Promise(resolve => setTimeout(resolve, 15000));
      const result = await POST(new Request("http://local/api/plan-edit", { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": "sequence-evaluation" }, body: JSON.stringify({ instruction, context: { ...buildPlannerContext(scene, []), recentInstructions: history } }) }));
      const plan = await result.json();
      expect(result.status, plan.error || `step ${i + 1}`).toBe(200);
      expect(plan.status, JSON.stringify(plan)).toBe("proposal");
      scene = buildPatch(scene, plan.operations).elements;
      history.push(instruction);
    }
    const graph = reconcileScene(scene);
    const id = (name: string) => {
      const matches = graph.nodes.filter(n => n.label.toLowerCase().replace(/[^a-z0-9]/g, "").includes(name));
      expect(matches, name).toHaveLength(1);
      return matches[0].id;
    };
    for (const [from, to] of [["springboot", "mongodb"], ["springboot", "rabbitmq"], ["springboot", "stripe"], ["springboot", "elasticsearch"], ["springboot", "gcs"], ["aws", "springboot"], ["vercel", "astro"], ["gitlab", "vercel"]]) {
      expect(graph.edges.some(edge => edge.from === id(from) && edge.to === id(to)), `${from} -> ${to}`).toBe(true);
    }
    expect(graph.nodes.some(n => /postgres/i.test(n.label))).toBe(false);
    expect(graph.edges.some(edge => edge.from === id("gcs") && edge.to === id("vercel"))).toBe(false);
  }, 180000);
});
