import { describe, expect, it } from "vitest";
import { buildPatch, parseOperations, sceneSnapshot } from "./patch";
import { reconcileScene } from "./reconcile";
import type { ExcalidrawElement } from "../../types/diagram";

function fixture(count = 5): ExcalidrawElement[] {
  const nodes = Array.from({ length: count }, (_, i) => [
    { id: `n${i}`, type: "rectangle", x: i * 220, y: 15, width: 160, height: 70, backgroundColor: "#123456", version: 3, boundElements: [{ id: `t${i}`, type: "text" }] },
    { id: `t${i}`, type: "text", containerId: `n${i}`, text: `Node ${i}`, originalText: `Node ${i}`, width: 140, height: 24, fontSize: 16, version: 2 },
  ]).flat();
  return [...nodes, ...["a", "b"].flatMap(id => [
    { id, type: "arrow", startBinding: { elementId: "n0", focus: 0, gap: 1 }, endBinding: { elementId: "n1", focus: 0, gap: 1 } },
    { id: `${id}-label`, type: "text", containerId: id, text: id, width: 80, fontSize: 13 },
  ]), { id: "manual-note", type: "freedraw", points: [[0, 0], [4, 9]], customData: { anything: true } }];
}

describe("live scene reconciliation", () => {
  it("reads manual native labels and independently identifies parallel arrows", () => {
    const index = reconcileScene(fixture());
    expect(index.nodes[0]).toMatchObject({ id: "n0", label: "Node 0", textId: "t0" });
    expect(index.edges.map(edge => edge.id)).toEqual(["a", "b"]);
    expect(index.opaqueIds).toEqual(["manual-note"]);
  });
  it("ignores deleted content and group backgrounds", () => {
    expect(reconcileScene([{ id: "x", type: "rectangle", isDeleted: true }, { id: "g", type: "rectangle", customData: { yapdraw: { type: "group" } } }]).nodes).toEqual([]);
  });
  it("does not infer a detached arrow’s endpoints from stale generated metadata", () => {
    const scene = fixture();
    const arrow = scene.find(el => el.id === "a")!;
    arrow.startBinding = null;
    arrow.customData = { yapdraw: { type: "edge", from: "n0", to: "n1" } };
    expect(reconcileScene(scene).edges.map(edge => edge.id)).toEqual(["b"]);
    expect(() => buildPatch(scene, [{ type: "removeNode", id: "n0" }])).toThrow("Unsupported dependent");
  });
});

describe("atomic native patches", () => {
  it.each([5, 15, 30])("preserves unrelated native content on a %i-node scene", count => {
    const scene = fixture(count);
    const before = sceneSnapshot(scene);
    const patch = buildPatch(scene, [{ type: "updateNode", id: "n0", label: "API" }]);
    expect(patch.affectedIds).toEqual(["t0"]);
    expect(patch.elements.find(el => el.id === "t0")?.text).toBe("API");
    for (const el of scene.filter(el => el.id !== "t0")) expect(patch.elements.find(next => next.id === el.id)).toBe(el);
    expect(sceneSnapshot(scene)).toBe(before);
  });
  it("removes only one parallel connection and its label", () => {
    const patch = buildPatch(fixture(), [{ type: "removeEdge", id: "a" }]);
    expect(patch.affectedIds.sort()).toEqual(["a", "a-label"]);
    expect(patch.elements.find(el => el.id === "b")?.isDeleted).toBeUndefined();
  });
  it("renames one edge without replacing its parallel sibling or endpoints", () => {
    const scene = fixture();
    const patch = buildPatch(scene, [{ type: "updateEdge", id: "a", label: "HTTP" }]);
    expect(patch.affectedIds).toEqual(["a-label"]);
    expect(patch.elements.find(el => el.id === "a")).toBe(scene.find(el => el.id === "a"));
    expect(patch.elements.find(el => el.id === "b")).toBe(scene.find(el => el.id === "b"));
    expect(patch.elements.find(el => el.id === "a-label")?.originalText).toBe("HTTP");
  });
  it("accepts 60 independently bound connections and cycles; rejects scope overflow", () => {
    const scene = fixture(30);
    for (let i = 2; i < 60; i++) scene.push({ id: `edge-${i}`, type: "arrow", startBinding: { elementId: `n${i % 30}` }, endBinding: { elementId: `n${(i + 1) % 30}` } });
    expect(reconcileScene(scene).edges).toHaveLength(60);
    expect(buildPatch(scene, [{ type: "updateNode", id: "n0", label: "API" }]).affectedIds).toEqual(["t0"]);
    expect(() => buildPatch([...scene, { id: "overflow", type: "rectangle" }], [{ type: "removeEdge", id: "a" }])).toThrow("30 nodes");
  });
  it("declares node deletion cascades and retains tombstones", () => {
    const patch = buildPatch(fixture(), [{ type: "removeNode", id: "n0" }]);
    expect(patch.affectedIds.sort()).toEqual(["a", "a-label", "b", "b-label", "n0", "t0"]);
    expect(patch.elements.filter(el => el.isDeleted)).toHaveLength(6);
  });
  it("repairs reciprocal arrow references on surviving nodes", () => {
    const scene = fixture();
    scene[0].boundElements.push({ id: "a", type: "arrow" });
    const patch = buildPatch(scene, [{ type: "removeEdge", id: "a" }]);
    expect(patch.elements[0].boundElements).toEqual([{ id: "t0", type: "text" }]);
  });
  it("rejects a whole batch if a later operation is invalid", () => {
    const scene = fixture();
    const before = sceneSnapshot(scene);
    expect(() => buildPatch(scene, [{ type: "updateNode", id: "n0", label: "API" }, { type: "removeNode", id: "missing" }])).toThrow();
    expect(sceneSnapshot(scene)).toBe(before);
  });
  it.each([
    [{ type: "updateNode", id: "n0", label: "" }],
    [{ type: "updateNode", id: "n0", label: "API", x: 42 }],
    [{ type: "exec", id: "n0" }],
    Array(51).fill({ type: "removeNode", id: "n0" }),
  ].map(operations => [operations]))("rejects malformed or oversized operations", operations => expect(() => parseOperations(operations)).toThrow());
  it("protects locked content, no-ops and overflowing labels", () => {
    const scene = fixture();
    expect(() => buildPatch(scene, [{ type: "updateNode", id: "n0", label: "Node 0" }])).toThrow("no change");
    expect(() => buildPatch(scene, [{ type: "updateNode", id: "n0", label: "x".repeat(100) }])).toThrow("may not fit");
    scene[0].locked = true;
    expect(() => buildPatch(scene, [{ type: "removeNode", id: "n0" }])).toThrow("Unlock");
  });
  it("rejects ambiguous bound text and duplicate native IDs", () => {
    const scene = fixture();
    expect(() => buildPatch([...scene, { id: "extra", type: "text", containerId: "n0", text: "Second" }], [{ type: "updateNode", id: "n0", label: "API" }])).toThrow("single unlocked");
    expect(() => buildPatch([...scene, scene[0]], [{ type: "removeNode", id: "n0" }])).toThrow("duplicate IDs");
  });
  it("normalizes object key order while detecting manual changes", () => {
    expect(sceneSnapshot([{ id: "a", x: 1 }])).toBe(sceneSnapshot([{ x: 1, id: "a" }]));
    expect(sceneSnapshot([{ id: "a", x: 1 }])).not.toBe(sceneSnapshot([{ id: "a", x: 2 }]));
  });
});

describe("add and connect", () => {
  const ids = () => { let n = 0; return { newId: () => `new${++n}`, random: () => 0.5 }; };
  const unchangedExcept = (scene: ExcalidrawElement[], next: ExcalidrawElement[], changed: string[]) => {
    for (const el of scene.filter(el => !changed.includes(el.id))) expect(next.find(item => item.id === el.id)).toBe(el);
  };

  it("renames to a longer label that fits the shape, not just the old text width", () => {
    const scene = fixture();
    scene[1].width = 40;
    const patch = buildPatch(scene, [{ type: "updateNode", id: "n0", label: "Database" }]);
    const text = patch.elements.find(el => el.id === "t0")!;
    expect(text.text).toBe("Database");
    expect(text.x + text.width / 2).toBeCloseTo(scene[0].x + scene[0].width / 2);
  });

  it("places a new node near its anchor without moving anything", () => {
    const scene = fixture();
    const before = sceneSnapshot(scene);
    const patch = buildPatch(scene, [{ type: "addNode", ref: "cache", label: "Cache", near: "n0" }], ids());
    expect(patch.affectedIds).toEqual(["new1", "new2"]);
    // Right of n0 is occupied by n1, so the next free candidate is below.
    expect(patch.elements.find(el => el.id === "new1")).toMatchObject({ type: "rectangle", x: 0, y: 165, boundElements: [{ type: "text", id: "new2" }] });
    expect(patch.elements.find(el => el.id === "new2")).toMatchObject({ containerId: "new1", text: "Cache", fontSize: 16 });
    unchangedExcept(scene, patch.elements, []);
    expect(sceneSnapshot(scene)).toBe(before);
    expect(reconcileScene(patch.elements).nodes.find(node => node.id === "new1")?.label).toBe("Cache");
  });

  it("adds and connects in one compound batch, in any spoken order", () => {
    const scene = fixture();
    const patch = buildPatch(scene, [
      { type: "addEdge", from: "queue", to: "n1", label: "events" },
      { type: "addNode", ref: "queue", label: "Queue" },
    ], ids());
    const arrow = patch.elements.find(el => el.type === "arrow" && el.id === "new3")!;
    expect(arrow).toMatchObject({ startBinding: { elementId: "new1" }, endBinding: { elementId: "n1" }, boundElements: [{ type: "text", id: "new4" }] });
    expect(patch.elements.find(el => el.id === "n1")?.boundElements).toContainEqual({ id: "new3", type: "arrow" });
    expect(patch.elements.find(el => el.id === "n1")?.version).toBe(4);
    expect(reconcileScene(patch.elements).edges).toContainEqual(expect.objectContaining({ id: "new3", from: "new1", to: "n1", label: "events" }));
    unchangedExcept(scene, patch.elements, ["n1"]);
    expect(patch.summary).toEqual(["Add “Queue” near “Node 1”.", "Connect “Queue” → “Node 1” (“events”)."]);
  });

  it("connects existing nodes and updates only their binding lists", () => {
    const scene = fixture();
    const patch = buildPatch(scene, [{ type: "addEdge", from: "n2", to: "n3" }], ids());
    expect(patch.affectedIds.sort()).toEqual(["n2", "n3", "new1"]);
    const arrow = patch.elements.find(el => el.id === "new1")!;
    expect(arrow.x).toBe(scene[4].x + scene[4].width);
    expect(arrow.points[1][0]).toBe(scene[6].x - arrow.x);
    unchangedExcept(scene, patch.elements, ["n2", "n3"]);
  });

  it.each([
    [[{ type: "addEdge", from: "n0", to: "n1" }], "already connected"],
    [[{ type: "addEdge", from: "n0", to: "n0" }], "itself"],
    [[{ type: "addEdge", from: "n0", to: "ghost" }], "Unknown or removed"],
    [[{ type: "removeNode", id: "n2" }, { type: "addEdge", from: "n2", to: "n3" }], "Unknown or removed"],
    [[{ type: "addEdge", from: "n2", to: "n3" }, { type: "removeNode", id: "n2" }], "removed in the same instruction"],
    [[{ type: "addNode", ref: "n0", label: "Clash" }], "already in use"],
    [[{ type: "updateNode", id: "fresh", label: "X" }, { type: "addNode", ref: "fresh", label: "Y" }], "missing"],
  ])("rejects invalid connections atomically (%#)", (operations, message) => {
    const scene = fixture();
    const before = sceneSnapshot(scene);
    expect(() => buildPatch(scene, operations, ids())).toThrow(message);
    expect(sceneSnapshot(scene)).toBe(before);
  });

  it("does not drop a new node onto an existing arrow's path", () => {
    const scene: ExcalidrawElement[] = [
      { id: "a", type: "rectangle", x: 0, y: 0, width: 160, height: 70 },
      { id: "b", type: "rectangle", x: 600, y: 0, width: 160, height: 70 },
      { id: "ab", type: "arrow", x: 160, y: 35, points: [[0, 0], [440, 0]], startBinding: { elementId: "a" }, endBinding: { elementId: "b" } },
    ];
    const patch = buildPatch(scene, [{ type: "addNode", ref: "c", label: "C", near: "a" }], ids());
    // Right of "a" is empty space but the a→b arrow runs through it.
    expect(patch.elements.find(el => el.id === "new1")).toMatchObject({ x: 0, y: 150 });
  });

  it("refuses to place a node when there is no clear space instead of moving work", () => {
    const scene = [...fixture(), { id: "zone", type: "ellipse", x: -2000, y: -2000, width: 5000, height: 5000 }];
    expect(() => buildPatch(scene, [{ type: "addNode", ref: "x", label: "X", near: "n0" }], ids())).toThrow("No clear space");
  });

  it("counts new nodes against the supported scene size", () => {
    expect(() => buildPatch(fixture(30), [{ type: "addNode", ref: "x", label: "X" }], ids())).toThrow("30 nodes");
  });

  it("is deterministic for the same scene, operations and ID source", () => {
    const operations = [{ type: "addNode", ref: "a1", label: "Worker", near: "n4" }, { type: "addEdge", from: "n4", to: "a1" }];
    expect(sceneSnapshot(buildPatch(fixture(), operations, ids()).elements)).toBe(sceneSnapshot(buildPatch(fixture(), operations, ids()).elements));
  });
});
