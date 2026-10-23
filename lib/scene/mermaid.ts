import type { ExcalidrawElement } from "../../types/diagram";
import { reconcileScene } from "./reconcile";

export interface MermaidExport {
  text: string;
  /** Visible elements that Mermaid cannot represent (drawings, images, free text, unbound arrows). */
  omitted: number;
}

// Mermaid entity codes keep quotes, brackets and newlines from breaking the syntax.
const escape = (label: string) =>
  label.replace(/"/g, "#quot;").replace(/\r?\n/g, "<br/>").replace(/[[\]{}()|<>]/g, ch => `#${ch.charCodeAt(0)};`).replace(/#60;br\/#62;/g, "<br/>");

const SHAPES: Record<string, [string, string]> = { diamond: ["{", "}"], ellipse: ["([", "])"] };

/** Mermaid flowchart derived from the current native scene, including manual edits. */
export function sceneToMermaid(elements: readonly ExcalidrawElement[]): MermaidExport {
  const live = elements.filter(el => !el.isDeleted);
  const index = reconcileScene(live);
  const byId = new Map(live.map(el => [el.id, el]));
  const ids = new Map(index.nodes.map((node, i) => [node.id, `n${i}`]));
  const centre = (el: ExcalidrawElement) => ({ x: (el.x ?? 0) + (el.width ?? 0) / 2, y: (el.y ?? 0) + (el.height ?? 0) / 2 });
  const xs = index.nodes.map(n => centre(byId.get(n.id)!).x);
  const ys = index.nodes.map(n => centre(byId.get(n.id)!).y);
  const wide = xs.length < 2 || Math.max(...xs) - Math.min(...xs) >= Math.max(...ys) - Math.min(...ys);
  const lines = [`flowchart ${wide ? "LR" : "TB"}`];
  const nodeLine = (id: string, label: string, indent: string) => {
    const [open, close] = SHAPES[byId.get(id)!.type] ?? ["[", "]"];
    return `${indent}${ids.get(id)}${open}"${escape(label || " ")}"${close}`;
  };

  // Generated group backgrounds become subgraphs; membership is by node centre.
  const groups = live.filter(el => el.customData?.yapdraw?.type === "group");
  const grouped = new Set<string>();
  const groupText = new Set<string>();
  groups.forEach((group, i) => {
    const members = index.nodes.filter(n => {
      const c = centre(byId.get(n.id)!);
      return !grouped.has(n.id) && c.x >= group.x && c.x <= group.x + group.width && c.y >= group.y && c.y <= group.y + group.height;
    });
    const title = live.find(el => el.type === "text" && el.containerId === group.id);
    if (title) groupText.add(title.id);
    if (!members.length) return;
    lines.push(`  subgraph g${i}["${escape(title?.text ?? "Group")}"]`);
    for (const n of members) { grouped.add(n.id); lines.push(nodeLine(n.id, n.label, "    ")); }
    lines.push("  end");
  });
  for (const n of index.nodes) if (!grouped.has(n.id)) lines.push(nodeLine(n.id, n.label, "  "));
  for (const e of index.edges) {
    const arrow = byId.get(e.id)!;
    const link = arrow.strokeStyle === "dashed" || arrow.strokeStyle === "dotted" ? "-.->" : arrow.endArrowhead == null ? "---" : "-->";
    lines.push(`  ${ids.get(e.from)} ${link}${e.label ? `|"${escape(e.label)}"|` : ""} ${ids.get(e.to)}`);
  }
  const represented = new Set([...groups.map(g => g.id), ...groupText, ...index.opaqueIds.filter(id => byId.get(id)?.customData?.yapdraw?.type === "icon")]);
  const omitted = index.opaqueIds.filter(id => !represented.has(id)).length;
  return { text: lines.join("\n"), omitted };
}
