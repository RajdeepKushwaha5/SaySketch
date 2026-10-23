import { describe, expect, it } from "vitest";
import { nodeGeometry, relayoutScene, untouchedSince } from "./relayout";
import type { ExcalidrawElement } from "../../types/diagram";

const node = (id: string, x: number, y: number): ExcalidrawElement[] => [
  { id, type: "rectangle", x, y, width: 160, height: 70, version: 1, boundElements: [{ id: `${id}-t`, type: "text" }] },
  { id: `${id}-t`, type: "text", containerId: id, text: id, x: x + 60, y: y + 25, width: 40, height: 20, version: 1 },
];
const edge = (id: string, from: string, to: string, label?: string): ExcalidrawElement[] => [
  { id, type: "arrow", x: 0, y: 0, points: [[0, 0], [10, 10]], startBinding: { elementId: from }, endBinding: { elementId: to }, version: 1 },
  ...(label ? [{ id: `${id}-t`, type: "text", containerId: id, text: label, x: 0, y: 0, width: 30, height: 16, version: 1 }] : []),
];
const box = (el: ExcalidrawElement) => ({ x: el.x, y: el.y, r: el.x + el.width, b: el.y + el.height });
const overlap = (a: ExcalidrawElement, b: ExcalidrawElement) => {
  const p = box(a); const q = box(b);
  return p.x < q.r && q.x < p.r && p.y < q.b && q.y < p.b;
};

// a messy scene like an incrementally placed one: stacked, overlapping, arrows crossing nodes
const messy = () => [
  ...node("web", 0, 0), ...node("cdn", 100, 20), ...node("api", 50, 200), ...node("db", 300, 30),
  ...edge("e1", "web", "cdn"), ...edge("e2", "cdn", "api", "HTTP"), ...edge("e3", "api", "db", "SQL"),
  { id: "icon-web", type: "image", x: 8, y: 8, width: 20, height: 20, customData: { yapdraw: { type: "icon" } }, version: 1 },
  { id: "doodle", type: "freedraw", x: 900, y: 900, width: 5, height: 5, points: [[0, 0], [5, 5]], version: 1 },
];

describe("tidy layout", () => {
  it("separates overlapping nodes, keeps labels and icons with them and routes arrows between them", () => {
    const scene = messy();
    const out = relayoutScene(scene)!;
    const get = (id: string) => out.elements.find(el => el.id === id)!;
    const nodes = ["web", "cdn", "api", "db"].map(get);
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) expect(overlap(nodes[i], nodes[j])).toBe(false);
    for (const id of ["web", "cdn", "api", "db"]) {
      const n = get(id); const t = get(`${id}-t`);
      const before = scene.find(el => el.id === id)!; const tb = scene.find(el => el.id === `${id}-t`)!;
      expect(t.x - n.x).toBeCloseTo(tb.x - before.x); // label moved with its node
    }
    expect(get("icon-web").x - get("web").x).toBeCloseTo(8);
    const e3 = get("e3");
    expect(e3.startBinding).toEqual({ elementId: "api" });
    const tip = { x: e3.x + e3.points.at(-1)[0], y: e3.y + e3.points.at(-1)[1] };
    const db = get("db");
    expect(tip.x).toBeGreaterThanOrEqual(db.x - 2); // the route ends at the target box
    expect(tip.x).toBeLessThanOrEqual(db.x + db.width + 2);
    expect(get("doodle")).toBe(scene.find(el => el.id === "doodle")); // hand drawing untouched
    expect(out.movedIds).not.toContain("doodle");
  });

  it("keeps the diagram anchored, is deterministic and leaves the input unmodified", () => {
    const scene = messy();
    const snapshot = JSON.stringify(scene);
    const a = relayoutScene(scene)!;
    const b = relayoutScene(messy())!;
    expect(JSON.stringify(a.elements)).toBe(JSON.stringify(b.elements));
    expect(Math.min(...["web", "cdn", "api", "db"].map(id => a.elements.find(el => el.id === id)!.x))).toBe(0);
    expect(JSON.stringify(scene)).toBe(snapshot);
  });

  it("declines when groups exist or there is nothing to arrange", () => {
    expect(relayoutScene([...messy(), { id: "g", type: "rectangle", x: 0, y: 0, width: 10, height: 10, customData: { yapdraw: { type: "group" } } }])).toBeNull();
    expect(relayoutScene(node("solo", 0, 0))).toBeNull();
  });
});

describe("arrangement tracking", () => {
  it("is untouched only while every AI-placed node stays put and nothing is hand-drawn", () => {
    const scene = [...node("a", 0, 0), ...node("b", 300, 0), ...edge("e", "a", "b")];
    const layout = nodeGeometry(scene);
    expect(untouchedSince(layout, scene)).toBe(true);
    expect(untouchedSince(null, scene)).toBe(false);
    const moved = scene.map(el => (el.id === "a" ? { ...el, x: 40 } : el));
    expect(untouchedSince(layout, moved)).toBe(false);
    expect(untouchedSince(layout, [...scene, { id: "pen", type: "freedraw", x: 1, y: 1, points: [[0, 0]] }])).toBe(false);
    expect(untouchedSince(layout, [...scene, ...node("manual", 600, 0)])).toBe(false);
  });
});
