import { describe, expect, it } from "vitest";
import { sceneToMermaid } from "./mermaid";
import type { ExcalidrawElement } from "../../types/diagram";

const node = (id: string, x: number, y: number, label: string, type = "rectangle"): ExcalidrawElement[] => [
  { id, type, x, y, width: 160, height: 70 },
  { id: `${id}-t`, type: "text", containerId: id, text: label },
];

describe("Mermaid from the live scene", () => {
  it("exports current labels, manual nodes and connections with safe IDs", () => {
    const scene = [
      ...node("a-b", 0, 0, 'Say "hi"\n[v2]'),
      ...node("a_b", 300, 0, "a|b {x}", "diamond"),
      ...node("gone", 600, 0, "Old"),
      { id: "e", type: "arrow", startBinding: { elementId: "a-b" }, endBinding: { elementId: "a_b" }, endArrowhead: "arrow" },
      { id: "e-t", type: "text", containerId: "e", text: "uses" },
      { id: "e2", type: "arrow", strokeStyle: "dashed", startBinding: { elementId: "a_b" }, endBinding: { elementId: "a-b" } },
      { id: "doodle", type: "freedraw" },
    ].map(el => (el.id === "gone" || el.id === "gone-t" ? { ...el, isDeleted: true } : el));
    const { text, omitted } = sceneToMermaid(scene);
    expect(text).toBe([
      "flowchart LR",
      '  n0["Say #quot;hi#quot;<br/>#91;v2#93;"]',
      '  n1{"a#124;b #123;x#125;"}',
      '  n0 -->|"uses"| n1',
      "  n1 -.-> n0",
    ].join("\n"));
    expect(omitted).toBe(1);
  });

  it("uses top-to-bottom for tall diagrams and subgraphs for group backgrounds", () => {
    const scene = [
      { id: "g", type: "rectangle", x: -20, y: -20, width: 200, height: 500, customData: { yapdraw: { type: "group" } } },
      { id: "g-t", type: "text", containerId: "g", text: "Backend" },
      ...node("api", 0, 0, "API"),
      ...node("db", 0, 300, "DB", "ellipse"),
      ...node("cdn", 400, 600, "CDN"),
    ];
    expect(sceneToMermaid(scene)).toEqual({
      text: ["flowchart TB", '  subgraph g0["Backend"]', '    n0["API"]', '    n1(["DB"])', "  end", '  n2["CDN"]'].join("\n"),
      omitted: 0,
    });
  });
});
