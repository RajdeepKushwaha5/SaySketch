import type { ExcalidrawElement } from "../../types/diagram";

export const BINDABLE_TYPES = new Set(["rectangle", "diamond", "ellipse"]);

/**
 * Bind generated arrows to their endpoint shapes on both sides (arrow bindings + shape boundElements),
 * so dragging a node keeps its arrows attached and the edit engine can see the connection. Pure.
 * Arrows that already carry a binding, or whose endpoints are missing, are left untouched.
 */
export function bindGeneratedArrows(elements: readonly ExcalidrawElement[]): ExcalidrawElement[] {
  const byId = new Map(elements.map(el => [el.id, el]));
  const added = new Map<string, { id: string; type: "arrow" }[]>();
  const bound = elements.map(el => {
    const meta = el.customData?.yapdraw;
    if (el.type !== "arrow" || el.isDeleted || meta?.type !== "edge" || el.startBinding || el.endBinding) return el;
    const from = byId.get(meta.from);
    const to = byId.get(meta.to);
    if (!from || !to || from.id === to.id || from.isDeleted || to.isDeleted || !BINDABLE_TYPES.has(from.type) || !BINDABLE_TYPES.has(to.type)) return el;
    for (const node of [from, to]) added.set(node.id, [...(added.get(node.id) ?? []), { id: el.id, type: "arrow" }]);
    return { ...el, startBinding: { elementId: from.id, focus: 0, gap: 1 }, endBinding: { elementId: to.id, focus: 0, gap: 1 } };
  });
  return bound.map(el => {
    const extra = added.get(el.id);
    if (!extra) return el;
    const existing: { id: string }[] = Array.isArray(el.boundElements) ? el.boundElements : [];
    const known = new Set(existing.map(item => item.id));
    return { ...el, boundElements: [...existing, ...extra.filter(item => !known.has(item.id))] };
  });
}

/** Older generated arrow labels lack originalText, which Excalidraw needs once a bound arrow moves. Pure. */
export function repairTextElements(elements: readonly ExcalidrawElement[]): ExcalidrawElement[] {
  return elements.map(el => (el.type === "text" && typeof el.originalText !== "string" ? { ...el, originalText: typeof el.text === "string" ? el.text : "" } : el));
}
