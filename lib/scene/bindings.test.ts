import { describe, expect, it } from "vitest";
import { bindGeneratedArrows, repairTextElements } from "./bindings";
import { buildPatch, sceneSnapshot } from "./patch";
import { reconcileScene } from "./reconcile";
import type { ExcalidrawElement } from "../../types/diagram";

function generated(): ExcalidrawElement[] {
  return [
    { id: "api", type: "rectangle", x: 0, y: 0, width: 160, height: 70, boundElements: [{ id: "api-t", type: "text" }], customData: { yapdraw: { type: "node", id: "api" } } },
    { id: "api-t", type: "text", containerId: "api", text: "API" },
    { id: "db", type: "rectangle", x: 300, y: 0, width: 160, height: 70, boundElements: [{ id: "db-t", type: "text" }], customData: { yapdraw: { type: "node", id: "db" } } },
    { id: "db-t", type: "text", containerId: "db", text: "DB" },
    { id: "arrow-api→db-0", type: "arrow", x: 160, y: 35, points: [[0, 0], [140, 0]], startBinding: null, endBinding: null, boundElements: [], customData: { yapdraw: { type: "edge", from: "api", to: "db" } } },
  ];
}

describe("generated arrow binding", () => {
  it("binds both ends and registers the arrow on both shapes", () => {
    const input = generated();
    const before = sceneSnapshot(input);
    const out = bindGeneratedArrows(input);
    expect(out[4]).toMatchObject({ startBinding: { elementId: "api", focus: 0, gap: 1 }, endBinding: { elementId: "db", focus: 0, gap: 1 } });
    expect(out[0].boundElements).toEqual([{ id: "api-t", type: "text" }, { id: "arrow-api→db-0", type: "arrow" }]);
    expect(out[2].boundElements).toContainEqual({ id: "arrow-api→db-0", type: "arrow" });
    expect(out[1]).toBe(input[1]);
    expect(sceneSnapshot(input)).toBe(before);
  });

  it("makes generated diagrams editable by the patch engine", () => {
    const scene = bindGeneratedArrows(generated());
    expect(reconcileScene(scene).edges).toEqual([{ id: "arrow-api→db-0", from: "api", to: "db", label: "", textId: undefined }]);
    const patch = buildPatch(scene, [{ type: "removeNode", id: "db" }]);
    expect(patch.affectedIds.sort()).toEqual(["api", "arrow-api→db-0", "db", "db-t"]);
    expect(patch.elements[0].boundElements).toEqual([{ id: "api-t", type: "text" }]);
  });

  it("leaves already-bound, manual and dangling arrows untouched", () => {
    const scene = generated();
    const bound = { ...scene[4], id: "b", startBinding: { elementId: "db", focus: 0, gap: 1 } };
    const manual = { id: "m", type: "arrow", startBinding: null, endBinding: null };
    const dangling = { ...scene[4], id: "d", customData: { yapdraw: { type: "edge", from: "api", to: "gone" } } };
    const out = bindGeneratedArrows([...scene, bound, manual, dangling]);
    expect(out.slice(5)).toEqual([bound, manual, dangling]);
    expect(out[5]).toBe(bound);
  });
});

describe("text repair", () => {
  it("fills missing originalText from text and leaves everything else as the same object", () => {
    const ok = { id: "a", type: "text", text: "A", originalText: "A" };
    const shape = { id: "s", type: "rectangle" };
    const out = repairTextElements([ok, shape, { id: "b", type: "text", text: "SQL" }, { id: "c", type: "text" }]);
    expect(out[0]).toBe(ok);
    expect(out[1]).toBe(shape);
    expect(out[2]).toMatchObject({ originalText: "SQL", text: "SQL" });
    expect(out[3].originalText).toBe("");
  });
});
