import type { ExcalidrawElement } from "../../types/diagram";

export interface SceneNode { id: string; label: string; textId?: string }
export interface SceneEdge extends SceneNode { from: string; to: string }
export interface SceneIndex { nodes: SceneNode[]; edges: SceneEdge[]; opaqueIds: string[] }

/** Read the current native scene, never the last model response. IDs are native IDs. */
export function reconcileScene(elements: readonly ExcalidrawElement[]): SceneIndex {
  const live = elements.filter(el => !el.isDeleted);
  const byId = new Map(live.map(el => [el.id, el]));
  const nodes = live.filter(el =>
    ["rectangle", "diamond", "ellipse"].includes(el.type) &&
    el.customData?.yapdraw?.type !== "group",
  ).map(el => {
    const texts = live.filter(text => text.type === "text" && text.containerId === el.id);
    const bound = texts.length === 1 ? texts[0] : undefined;
    return { id: el.id, label: bound?.text ?? el.label?.text ?? "", textId: bound?.id };
  });
  const nodeIds = new Set(nodes.map(node => node.id));
  const edges: SceneEdge[] = [];
  for (const el of live) {
    if (el.type !== "arrow") continue;
    // Native bindings are authoritative. Old metadata may be stale after manual detachment.
    // Unbound legacy arrows stay opaque until the native binding adapter is verified.
    const from = el.startBinding?.elementId;
    const to = el.endBinding?.elementId;
    if (!nodeIds.has(from) || !nodeIds.has(to)) continue;
    const texts = live.filter(text => text.type === "text" && text.containerId === el.id);
    const bound = texts.length === 1 ? texts[0] : undefined;
    edges.push({ id: el.id, from, to, label: bound?.text ?? "", textId: bound?.id });
  }
  const known = new Set([...nodes, ...edges].flatMap(el => [el.id, ...(el.textId ? [el.textId] : [])]));
  return { nodes, edges, opaqueIds: [...byId.keys()].filter(id => !known.has(id)) };
}
