import { nanoid } from "nanoid";
import type { ExcalidrawElement } from "../../types/diagram";
import { reconcileScene } from "./reconcile";

export type SceneOperation =
  | { type: "updateNode" | "updateEdge"; id: string; label: string }
  | { type: "removeNode" | "removeEdge"; id: string }
  | { type: "addNode"; ref: string; label: string; near?: string }
  | { type: "addEdge"; from: string; to: string; label?: string };

const FIELDS: Record<SceneOperation["type"], { required: string[]; optional: string[] }> = {
  updateNode: { required: ["id", "label"], optional: [] },
  updateEdge: { required: ["id", "label"], optional: [] },
  removeNode: { required: ["id"], optional: [] },
  removeEdge: { required: ["id"], optional: [] },
  addNode: { required: ["ref", "label"], optional: ["near"] },
  addEdge: { required: ["from", "to"], optional: ["label"] },
};
const ID_FIELDS = new Set(["id", "ref", "near", "from", "to"]);

/** Bounded operation set. Unknown types or fields fail closed; geometry is never accepted from the model. */
export function parseOperations(value: unknown): SceneOperation[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 50) throw new Error("Expected 1–50 operations.");
  return value.map(raw => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Invalid operation.");
    const op = raw as Record<string, unknown>;
    if (typeof op.type !== "string" || !Object.prototype.hasOwnProperty.call(FIELDS, op.type)) throw new Error("Unsupported operation.");
    const spec = FIELDS[op.type as SceneOperation["type"]];
    if (Object.keys(op).some(key => key !== "type" && !spec.required.includes(key) && !spec.optional.includes(key))) throw new Error("Unexpected operation field.");
    for (const key of [...spec.required, ...spec.optional]) {
      if (!(key in op) && spec.optional.includes(key)) continue;
      const item = op[key];
      if (ID_FIELDS.has(key) && (typeof item !== "string" || !item.length || item.length > 200)) throw new Error("Invalid element ID.");
      if (key === "label" && (typeof item !== "string" || !item.trim() || item.length > 500)) throw new Error("Label must contain 1–500 characters.");
    }
    return op as SceneOperation;
  });
}

export interface PatchCandidate {
  elements: ExcalidrawElement[];
  affectedIds: string[];
  summary: string[];
}

export interface PatchOptions {
  newId?: () => string;
  random?: () => number;
}

type Box = { x: number; y: number; w: number; h: number };

const NODE_SIZE = { w: 160, h: 70 };
const PLACE_GAP = 80;
const CLEARANCE = 20;
const BOUND_TEXT_PADDING = 5;
const LINE_HEIGHT = 1.25;
// Excalidraw re-measures text in the browser; this estimate only decides whether a label can fit.
const textWidth = (text: string, fontSize: number) => Math.max(...text.split("\n").map(line => line.length)) * fontSize * 0.6;
const boxOf = (el: ExcalidrawElement): Box => ({ x: el.x ?? 0, y: el.y ?? 0, w: el.width ?? 0, h: el.height ?? 0 });
const center = (b: Box) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.w + CLEARANCE && b.x < a.x + a.w + CLEARANCE && a.y < b.y + b.h + CLEARANCE && b.y < a.y + a.h + CLEARANCE;

function revised(el: ExcalidrawElement, changes: Partial<ExcalidrawElement>): ExcalidrawElement {
  return { ...el, ...changes, version: (el.version ?? 0) + 1, versionNonce: ((el.versionNonce ?? 0) + 1) % 2147483647 };
}

type Point = { x: number; y: number };
/** Absolute polyline segments of an arrow or line. */
const segmentsOf = (el: ExcalidrawElement): [Point, Point][] => {
  const pts: Point[] = (Array.isArray(el.points) ? el.points : []).map(([px, py]: [number, number]) => ({ x: (el.x ?? 0) + px, y: (el.y ?? 0) + py }));
  return pts.slice(1).map((p, i) => [pts[i], p]);
};
/** True when segment a-b passes through box b (expanded by CLEARANCE / 2). Liang–Barsky clipping. */
function crosses([a, b]: [Point, Point], box: Box) {
  const pad = CLEARANCE / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let t0 = 0;
  let t1 = 1;
  for (const [p, q] of [[-dx, a.x - (box.x - pad)], [dx, box.x + box.w + pad - a.x], [-dy, a.y - (box.y - pad)], [dy, box.y + box.h + pad - a.y]]) {
    if (p === 0) { if (q < 0) return false; continue; }
    const t = q / p;
    if (p < 0) t0 = Math.max(t0, t); else t1 = Math.min(t1, t);
    if (t0 > t1) return false;
  }
  return true;
}

/** Point on a box's edge along the line from its centre towards `toward`. */
function edgePoint(b: Box, toward: { x: number; y: number }) {
  const c = center(b);
  const dx = toward.x - c.x;
  const dy = toward.y - c.y;
  const scale = Math.min(dx ? b.w / 2 / Math.abs(dx) : Infinity, dy ? b.h / 2 / Math.abs(dy) : Infinity);
  return { x: c.x + dx * scale, y: c.y + dy * scale };
}

/** Pure, atomic candidate builder. Neither the input nor any of its objects is mutated. */
export function buildPatch(scene: readonly ExcalidrawElement[], raw: unknown, options: PatchOptions = {}): PatchCandidate {
  const operations = parseOperations(raw);
  const newId = options.newId ?? (() => nanoid());
  const random = options.random ?? Math.random;
  const seed = () => Math.floor(random() * 2147483647);
  if (new Set(scene.map(el => el.id)).size !== scene.length) throw new Error("Scene contains duplicate IDs.");
  const index = reconcileScene(scene);
  const addedNodes = operations.filter(op => op.type === "addNode").length;
  const addedEdges = operations.filter(op => op.type === "addEdge").length;
  if (index.nodes.length + addedNodes > 30 || index.edges.length + addedEdges > 60) throw new Error("Editing supports up to 30 nodes and 60 connections.");
  const byId = new Map(scene.map(el => [el.id, el]));
  const replacements = new Map<string, ExcalidrawElement>();
  const created: ExcalidrawElement[] = [];
  const removed = new Set<string>();
  const summary: string[] = [];
  const renamed = new Set<string>();
  const refs = new Map<string, string>(); // model temp ref -> new native ID
  const current = (id: string) => replacements.get(id) ?? byId.get(id) ?? created.find(el => el.id === id);
  const labelOf = (id: string) => index.nodes.find(node => node.id === id)?.label ?? created.find(el => el.containerId === id)?.text ?? id;
  const remove = (id: string) => {
    const el = byId.get(id);
    if (!el) throw new Error("Missing dependent element.");
    if (el.locked) throw new Error("Unlock the affected elements before editing.");
    removed.add(id);
    for (const text of scene.filter(item => !item.isDeleted && item.type === "text" && item.containerId === id)) {
      if (text.locked) throw new Error("Unlock the affected label before editing.");
      removed.add(text.id);
    }
  };
  /** Resolve an existing node ID or a same-batch ref to a live node ID. */
  const nodeId = (id: string) => {
    const resolved = refs.get(id) ?? id;
    const isNode = index.nodes.some(node => node.id === resolved) || created.some(el => el.id === resolved);
    if (!isNode || removed.has(resolved)) throw new Error(`Unknown or removed node “${id}”.`);
    return resolved;
  };
  const bindTo = (id: string, binding: { id: string; type: string }) => {
    const el = current(id)!;
    if (el.locked) throw new Error("Unlock the connected element before adding a connection.");
    const next = { ...el, boundElements: [...(Array.isArray(el.boundElements) ? el.boundElements : []), binding] };
    if (created.includes(el)) created[created.indexOf(el)] = next;
    else replacements.set(id, replacements.has(id) ? next : revised(el, { boundElements: next.boundElements }));
  };
  const textElement = (id: string, containerId: string, text: string, box: Box, fontSize: number, base: ExcalidrawElement | undefined): ExcalidrawElement => {
    const width = textWidth(text, fontSize);
    const height = text.split("\n").length * fontSize * LINE_HEIGHT;
    return {
      type: "text", id, x: box.x + (box.w - width) / 2, y: box.y + (box.h - height) / 2, width, height,
      text, originalText: text, containerId, fontSize, fontFamily: base?.fontFamily ?? 1, lineHeight: LINE_HEIGHT,
      textAlign: "center", verticalAlign: "middle", autoResize: true, strokeColor: base?.strokeColor ?? "#1e1e1e",
      backgroundColor: "transparent", fillStyle: "solid", strokeWidth: 1, strokeStyle: "solid", roughness: 0, opacity: 100,
      angle: 0, groupIds: [], frameId: null, roundness: null, boundElements: [], link: null, locked: false,
      seed: seed(), version: 1, versionNonce: seed(), isDeleted: false, updated: 1,
    };
  };
  const obstacles = () => [
    ...scene.filter(el => !el.isDeleted && !removed.has(el.id) && el.type !== "arrow" && el.type !== "line" && !el.containerId),
    ...created.filter(el => el.type !== "arrow" && !el.containerId),
  ].map(boxOf);
  // A node dropped onto an existing arrow reads as connected to it, so arrow paths are obstacles too.
  const paths = () => scene.filter(el => !el.isDeleted && !removed.has(el.id) && (el.type === "arrow" || el.type === "line")).flatMap(segmentsOf);
  const place = (anchor: Box | undefined, w: number, h: number): Box => {
    const taken = obstacles();
    const lines = paths();
    if (!anchor) {
      if (!taken.length) return { x: 0, y: 0, w, h };
      const right = Math.max(...taken.map(b => b.x + b.w));
      const top = Math.min(...taken.map(b => b.y));
      anchor = { x: right - w, y: top, w, h };
    }
    for (let ring = 0; ring < 3; ring++) {
      const a = anchor;
      const candidates: Box[] = [
        { x: a.x + a.w + PLACE_GAP + ring * (w + PLACE_GAP), y: a.y + (a.h - h) / 2, w, h },
        { x: a.x + (a.w - w) / 2, y: a.y + a.h + PLACE_GAP + ring * (h + PLACE_GAP), w, h },
        { x: a.x + (a.w - w) / 2, y: a.y - h - PLACE_GAP - ring * (h + PLACE_GAP), w, h },
        { x: a.x - w - PLACE_GAP - ring * (w + PLACE_GAP), y: a.y + (a.h - h) / 2, w, h },
      ];
      const free = candidates.find(c => !taken.some(b => overlaps(c, b)) && !lines.some(segment => crosses(segment, c)));
      if (free) return free;
    }
    // Never move unrelated work to make room.
    throw new Error("No clear space near the new node. Make room or arrange the diagram first.");
  };

  // New nodes are placed first so connections may name them regardless of spoken order.
  const ordered = [...operations.filter(op => op.type === "addNode"), ...operations.filter(op => op.type !== "addNode")];
  ordered.forEach(op => {
    if (op.type === "addNode") {
      if (refs.has(op.ref) || byId.has(op.ref)) throw new Error(`Reference “${op.ref}” is already in use.`);
      // Anchor: explicit `near`, else the first same-batch connection to an existing or already placed node.
      const link = op.near ? undefined : operations.find(other =>
        other.type === "addEdge" && [other.from, other.to].includes(op.ref) &&
        [other.from, other.to].some(end => end !== op.ref && (refs.has(end) || index.nodes.some(node => node.id === end))));
      const anchorRef = op.near ?? (link?.type === "addEdge" ? (link.from === op.ref ? link.to : link.from) : undefined);
      const anchor = anchorRef ? current(nodeId(anchorRef)) : undefined;
      const anchorText = anchor && (scene.find(el => !el.isDeleted && el.containerId === anchor.id) ?? created.find(el => el.containerId === anchor.id));
      const fontSize = anchorText?.fontSize ?? 15;
      const w = Math.min(320, Math.max(NODE_SIZE.w, textWidth(op.label, fontSize) + 2 * BOUND_TEXT_PADDING + 20));
      const box = place(anchor ? boxOf(anchor) : undefined, w, NODE_SIZE.h);
      const id = newId();
      const textId = newId();
      refs.set(op.ref, id);
      created.push({
        type: "rectangle", id, x: box.x, y: box.y, width: box.w, height: box.h, angle: 0,
        strokeColor: anchor?.strokeColor ?? "#495057", backgroundColor: anchor?.backgroundColor ?? "#f1f3f5",
        fillStyle: anchor?.fillStyle ?? "solid", strokeWidth: anchor?.strokeWidth ?? 2, strokeStyle: anchor?.strokeStyle ?? "solid",
        roughness: anchor?.roughness ?? 1, opacity: anchor?.opacity ?? 100, roundness: anchor?.type === "rectangle" ? anchor.roundness ?? null : { type: 3 },
        groupIds: [], frameId: null, boundElements: [{ type: "text", id: textId }], link: null, locked: false,
        seed: seed(), version: 1, versionNonce: seed(), isDeleted: false, updated: 1,
        customData: { yapdraw: { type: "node", id } },
      }, textElement(textId, id, op.label, box, fontSize, anchorText));
      summary.push(anchor ? `Add “${op.label}” near “${labelOf(anchor.id)}”.` : `Add “${op.label}”.`);
      return;
    }
    if (op.type === "addEdge") {
      const from = nodeId(op.from);
      const to = nodeId(op.to);
      if (from === to) throw new Error("A node cannot be connected to itself.");
      if (index.edges.some(edge => edge.from === from && edge.to === to && !removed.has(edge.id)) ||
        created.some(el => el.type === "arrow" && el.startBinding.elementId === from && el.endBinding.elementId === to)) {
        throw new Error(`“${labelOf(from)}” is already connected to “${labelOf(to)}”.`);
      }
      const a = boxOf(current(from)!);
      const b = boxOf(current(to)!);
      const start = edgePoint(a, center(b));
      const end = edgePoint(b, center(a));
      const id = newId();
      const textId = op.label ? newId() : undefined;
      created.push({
        type: "arrow", id, x: start.x, y: start.y, width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y),
        points: [[0, 0], [end.x - start.x, end.y - start.y]], angle: 0, strokeColor: "#495057", backgroundColor: "transparent",
        fillStyle: "solid", strokeWidth: 2, strokeStyle: "solid", roughness: 0, opacity: 100, roundness: { type: 2 },
        groupIds: [], frameId: null, boundElements: textId ? [{ type: "text", id: textId }] : [], link: null, locked: false,
        startArrowhead: null, endArrowhead: "arrow", lastCommittedPoint: null, elbowed: false,
        startBinding: { elementId: from, focus: 0, gap: 1 }, endBinding: { elementId: to, focus: 0, gap: 1 },
        seed: seed(), version: 1, versionNonce: seed(), isDeleted: false, updated: 1,
        customData: { yapdraw: { type: "edge", from, to } },
      });
      if (textId && op.label) {
        const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
        created.push(textElement(textId, id, op.label, { x: mid.x, y: mid.y, w: 0, h: 0 }, 13, undefined));
      }
      bindTo(from, { id, type: "arrow" });
      bindTo(to, { id, type: "arrow" });
      summary.push(`Connect “${labelOf(from)}” → “${labelOf(to)}”${op.label ? ` (“${op.label}”)` : ""}.`);
      return;
    }
    const items = op.type.endsWith("Node") ? index.nodes : index.edges;
    const semantic = items.find(item => item.id === op.id);
    const el = byId.get(op.id);
    if (!semantic || !el || removed.has(op.id)) throw new Error("The referenced element is missing or already removed.");
    if (el.locked) throw new Error("Unlock the selected element before editing.");
    if ("label" in op) {
      if (renamed.has(op.id)) throw new Error("An element cannot be renamed twice in one proposal.");
      renamed.add(op.id);
      if (semantic.label === op.label) return;
      const text = semantic.textId ? byId.get(semantic.textId) : undefined;
      if (!text || text.locked) throw new Error("This element needs a single unlocked native bound label before it can be renamed.");
      // Keep the container's geometry; a label wider or taller than the shape needs a reviewed resize.
      const fontSize = text.fontSize ?? 20;
      const width = textWidth(op.label, fontSize);
      const height = op.label.split("\n").length * fontSize * (text.lineHeight ?? LINE_HEIGHT);
      if (op.type === "updateNode" && (width > el.width - 2 * BOUND_TEXT_PADDING || height > el.height - 2 * BOUND_TEXT_PADDING)) {
        throw new Error("The new label may not fit. Shorten it or resize the shape manually first.");
      }
      const position = op.type === "updateNode"
        ? { x: el.x + (el.width - width) / 2, y: el.y + (el.height - height) / 2 }
        : { x: (text.x ?? 0) + ((text.width ?? 0) - width) / 2, y: (text.y ?? 0) + ((text.height ?? 0) - height) / 2 };
      replacements.set(text.id, revised(text, { text: op.label, originalText: op.label, width, height, ...position }));
      summary.push(`Rename “${semantic.label}” to “${op.label}”.`);
      return;
    }
    remove(el.id);
    if (op.type === "removeNode") {
      if (byId.get(`icon-${el.id}`) && !byId.get(`icon-${el.id}`)?.isDeleted) throw new Error("Remove this node’s icon manually before deleting the node.");
      for (const edge of index.edges.filter(edge => edge.from === el.id || edge.to === el.id)) remove(edge.id);
      // Refuse ambiguous native dependencies rather than silently detaching imported content.
      for (const other of scene.filter(item => !item.isDeleted && !removed.has(item.id))) {
        if (other.startBinding?.elementId === el.id || other.endBinding?.elementId === el.id || other.containerId === el.id ||
          (other.customData?.yapdraw?.type === "edge" && [other.customData.yapdraw.from, other.customData.yapdraw.to].includes(el.id))) throw new Error("Unsupported dependent content must be detached manually first.");
      }
    }
    summary.push(`Remove “${semantic.label || semantic.id}” and its dependent labels/connections.`);
  });
  if (created.some(el => el.startBinding && removed.has(el.startBinding.elementId) || el.endBinding && removed.has(el.endBinding.elementId))) {
    throw new Error("A new connection refers to a node removed in the same instruction.");
  }
  // Repair reciprocal references only on affected neighbors. Preserve every unrelated field.
  for (const el of scene) {
    const latest = replacements.get(el.id) ?? el;
    if (removed.has(el.id) || el.isDeleted || !Array.isArray(latest.boundElements)) continue;
    const bindings = latest.boundElements.filter((binding: { id: string }) => !removed.has(binding.id));
    if (bindings.length !== latest.boundElements.length) {
      if (el.locked) throw new Error("Unlock the connected element before removing its connection.");
      replacements.set(el.id, replacements.has(el.id) ? { ...latest, boundElements: bindings } : revised(el, { boundElements: bindings }));
    }
  }
  for (const id of removed) {
    const el = byId.get(id)!;
    replacements.set(id, revised(el, { isDeleted: true }));
  }
  if (!replacements.size && !created.length) throw new Error("This instruction makes no change.");
  return {
    elements: [...scene.map(el => replacements.get(el.id) ?? el), ...created],
    affectedIds: [...replacements.keys(), ...created.map(el => el.id)],
    summary,
  };
}

/** Compare full content, not Excalidraw's version sum/hash. Key order is normalized. */
export function sceneSnapshot(scene: readonly ExcalidrawElement[]): string {
  function stable(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(stable);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stable(item)]));
    return value;
  }
  return JSON.stringify(stable(scene));
}
