import dagre from "dagre";
import type { ExcalidrawElement } from "../../types/diagram";
import { reconcileScene } from "./reconcile";

type Point = { x: number; y: number };

const revised = (el: ExcalidrawElement, changes: Partial<ExcalidrawElement>): ExcalidrawElement => ({
  ...el, ...changes, version: (el.version ?? 0) + 1, versionNonce: ((el.versionNonce ?? 0) + 1) % 2147483647,
});
const centre = (el: ExcalidrawElement): Point => ({ x: (el.x ?? 0) + (el.width ?? 0) / 2, y: (el.y ?? 0) + (el.height ?? 0) / 2 });

/** Same spacing as generation (lib/render/layout.ts), so a tidied diagram looks like a generated one. */
const SPACING = { LR: { nodesep: 60, ranksep: 120 }, TB: { nodesep: 80, ranksep: 100 } };

/**
 * Re-lay out the live diagram's nodes and connections with dagre, keeping every element's identity,
 * style, label and binding. Only nodes, their labels/icons and connection arrows move; drawings, free
 * text and other content stay put. Returns null when a re-layout would be unsafe (groups) or pointless.
 */
export function relayoutScene(scene: readonly ExcalidrawElement[]): { elements: ExcalidrawElement[]; movedIds: string[] } | null {
  const live = scene.filter(el => !el.isDeleted);
  // group backgrounds are sized around their members; moving members would break them
  if (live.some(el => el.customData?.yapdraw?.type === "group")) return null;
  const index = reconcileScene(live);
  if (index.nodes.length < 2) return null;
  const byId = new Map(live.map(el => [el.id, el]));

  const xs = index.nodes.map(n => centre(byId.get(n.id)!).x);
  const ys = index.nodes.map(n => centre(byId.get(n.id)!).y);
  const direction = Math.max(...xs) - Math.min(...xs) >= Math.max(...ys) - Math.min(...ys) ? "LR" : "TB";

  const g = new dagre.graphlib.Graph({ multigraph: true });
  g.setGraph({ rankdir: direction, ...SPACING[direction], marginx: 0, marginy: 0, acyclicer: "greedy", ranker: "network-simplex" });
  g.setDefaultEdgeLabel(() => ({}));
  for (const n of index.nodes) {
    const el = byId.get(n.id)!;
    g.setNode(n.id, { width: el.width ?? 160, height: el.height ?? 70 });
  }
  for (const e of index.edges) {
    // labelled connections get room for their label
    g.setEdge(e.from, e.to, e.label ? { width: Math.min(160, e.label.length * 8 + 16), height: 20, labelpos: "c" } : {}, e.id);
  }
  dagre.layout(g);

  // keep the diagram anchored where it was, so the view does not jump
  const oldLeft = Math.min(...index.nodes.map(n => byId.get(n.id)!.x ?? 0));
  const oldTop = Math.min(...index.nodes.map(n => byId.get(n.id)!.y ?? 0));
  const placed = index.nodes.map(n => {
    const pos = g.node(n.id);
    const el = byId.get(n.id)!;
    return { id: n.id, x: pos.x - (el.width ?? 0) / 2, y: pos.y - (el.height ?? 0) / 2 };
  });
  const dx = oldLeft - Math.min(...placed.map(p => p.x));
  const dy = oldTop - Math.min(...placed.map(p => p.y));

  const updates = new Map<string, ExcalidrawElement>();
  const shift = (el: ExcalidrawElement, ox: number, oy: number) => {
    if (Math.abs(ox) < 0.5 && Math.abs(oy) < 0.5) return;
    updates.set(el.id, revised(el, { x: (el.x ?? 0) + ox, y: (el.y ?? 0) + oy }));
  };
  for (const p of placed) {
    const node = byId.get(p.id)!;
    const ox = Math.round(p.x + dx) - (node.x ?? 0);
    const oy = Math.round(p.y + dy) - (node.y ?? 0);
    shift(node, ox, oy);
    // the node's label and icon badge travel with it
    for (const el of live) {
      if (el.containerId === node.id || el.id === `icon-${node.id}`) shift(el, ox, oy);
    }
  }
  for (const e of index.edges) {
    const route = g.edge({ v: e.from, w: e.to, name: e.id })?.points as Point[] | undefined;
    if (!route || route.length < 2) continue;
    const pts = route.map(p => ({ x: Math.round(p.x + dx), y: Math.round(p.y + dy) }));
    const start = pts[0];
    const arrow = byId.get(e.id)!;
    updates.set(arrow.id, revised(arrow, {
      x: start.x, y: start.y,
      points: pts.map(p => [p.x - start.x, p.y - start.y]),
      width: Math.max(...pts.map(p => p.x)) - Math.min(...pts.map(p => p.x)),
      height: Math.max(...pts.map(p => p.y)) - Math.min(...pts.map(p => p.y)),
    }));
    if (e.textId) {
      // label sits at the middle of the route
      const a = pts[Math.floor((pts.length - 1) / 2)];
      const b = pts[Math.ceil((pts.length - 1) / 2)] ?? a;
      const text = byId.get(e.textId)!;
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      updates.set(text.id, revised(text, { x: mid.x - (text.width ?? 0) / 2, y: mid.y - (text.height ?? 0) / 2 }));
    }
  }
  if (!updates.size) return null;
  return { elements: scene.map(el => updates.get(el.id) ?? el), movedIds: [...updates.keys()] };
}

/** Node geometry fingerprint, used to tell whether the user has arranged anything since the last AI layout. */
export function nodeGeometry(scene: readonly ExcalidrawElement[]): Map<string, string> {
  const index = reconcileScene(scene.filter(el => !el.isDeleted));
  const byId = new Map(scene.map(el => [el.id, el]));
  return new Map(index.nodes.map(n => {
    const el = byId.get(n.id)!;
    return [n.id, `${Math.round(el.x ?? 0)},${Math.round(el.y ?? 0)},${Math.round(el.width ?? 0)},${Math.round(el.height ?? 0)}`];
  }));
}

/** True when every node the AI laid out is still where it put it and nothing was added by hand. */
export function untouchedSince(layout: Map<string, string> | null, scene: readonly ExcalidrawElement[]): boolean {
  if (!layout) return false;
  const now = nodeGeometry(scene);
  if (now.size !== layout.size) return false;
  for (const [id, geo] of now) if (layout.get(id) !== geo) return false;
  const live = scene.filter(el => !el.isDeleted);
  // hand-drawn extras (strokes, free text, images) count as arranging too
  const index = reconcileScene(live);
  return index.opaqueIds.every(id => live.find(el => el.id === id)?.customData?.yapdraw?.type === "icon");
}
