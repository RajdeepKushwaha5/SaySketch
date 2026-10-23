import { describe, expect, it } from "vitest";
import { buildPlannerContext, parseModelJSON, parsePlannerContext, plannerMessages, validatePlan } from "./plan";
import type { ExcalidrawElement } from "../../types/diagram";

const scene: ExcalidrawElement[] = [
  { id: "api", type: "rectangle", x: 0, y: 0, width: 160, height: 70 },
  { id: "api-t", type: "text", containerId: "api", text: "API" },
  { id: "db", type: "rectangle", x: 300, y: 0, width: 160, height: 70 },
  { id: "db-t", type: "text", containerId: "db", text: "DB" },
  { id: "e1", type: "arrow", startBinding: { elementId: "api" }, endBinding: { elementId: "db" } },
  { id: "note", type: "freedraw" },
];
const ctx = buildPlannerContext(scene, ["api-t", "note", "e1"]);

describe("planner context", () => {
  it("carries bounded previous wording without changing the live graph", () => {
    const enriched = parsePlannerContext({ ...ctx, recentInstructions: ["Spring Boot writes to Postgres", "Actually use MongoDB instead"] });
    const messages = plannerMessages("Connect it to storage", enriched);
    expect(messages[1].content).toContain("Spring Boot writes to Postgres");
    expect(messages[0].content).toContain("Never replay them");
    expect(enriched.nodes).toEqual(ctx.nodes);
    expect(() => parsePlannerContext({ ...ctx, recentInstructions: Array(7).fill("x") })).toThrow("conversation");
    expect(() => parsePlannerContext({ ...ctx, recentInstructions: [42] })).toThrow("conversation");
  });
  it("holds semantic IDs and labels only, resolving selected labels to their shapes", () => {
    expect(ctx).toEqual({
      nodes: [{ id: "api", label: "API" }, { id: "db", label: "DB" }],
      edges: [{ id: "e1", from: "api", to: "db", label: "" }],
      selected: ["api", "e1"],
    });
    expect(JSON.stringify(plannerMessages("x", ctx))).not.toContain("width");
  });
  it("bounds client-supplied context on the server", () => {
    expect(parsePlannerContext(ctx)).toEqual(ctx);
    expect(() => parsePlannerContext({ ...ctx, nodes: Array(31).fill({ id: "a", label: "b" }) })).toThrow("30 nodes");
    expect(() => parsePlannerContext({ ...ctx, nodes: [{ id: 5, label: "b" }] })).toThrow("Invalid");
    expect(() => parsePlannerContext({ nodes: [] })).toThrow("Invalid");
    expect(parsePlannerContext({ ...ctx, nodes: [{ id: "a", label: "b", x: 1 }] }).nodes).toEqual([{ id: "a", label: "b" }]);
  });
});

describe("plan validation", () => {
  it("accepts a compound proposal that uses refs before or after they are added", () => {
    const plan = validatePlan({ status: "proposal", operations: [
      { type: "addEdge", from: "api", to: "new-1" },
      { type: "addNode", ref: "new-1", label: "Cache", near: "api" },
      { type: "updateEdge", id: "e1", label: "SQL" },
    ] }, ctx);
    expect(plan.status).toBe("proposal");
  });
  it.each([
    [{ status: "proposal", operations: [{ type: "removeNode", id: "ghost" }] }, "Unknown node"],
    [{ status: "proposal", operations: [{ type: "removeEdge", id: "api" }] }, "Unknown connection"],
    [{ status: "proposal", operations: [{ type: "addEdge", from: "api", to: "new-9" }] }, "Unknown node"],
    [{ status: "proposal", operations: [{ type: "addNode", ref: "db", label: "X" }] }, "clashing"],
    [{ status: "proposal", operations: [{ type: "moveNode", id: "api" }] }, "Unsupported"],
    [{ status: "proposal", operations: [] }, "1–50"],
    [{ status: "done" }, "Unknown status"],
    [[], "JSON object"],
    [{ status: "clarification", question: "" }, "short question"],
  ])("rejects invalid replies (%#)", (reply, message) => expect(() => validatePlan(reply, ctx)).toThrow(message));
  it("passes clarifications and no-ops through without operations", () => {
    expect(validatePlan({ status: "clarification", question: " Which database? " }, ctx)).toEqual({ status: "clarification", question: "Which database?" });
    expect(validatePlan({ status: "no_change" }, ctx)).toEqual({ status: "no_change", reason: "The diagram already matches." });
  });
  it("reads JSON with or without a code fence", () => {
    expect(parseModelJSON('```json\n{"status":"no_change"}\n```')).toEqual({ status: "no_change" });
    expect(parseModelJSON('Sure: {"a":{"b":1}} ok')).toEqual({ a: { b: 1 } });
    expect(() => parseModelJSON("no")).toThrow("not JSON");
  });
});
