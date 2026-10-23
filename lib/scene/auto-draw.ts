import type { SceneOperation } from "./patch";

export const AUTO_DRAW_PAUSE_MS = 1800;

/** Destructive edits always require explicit review, even in Auto draw mode. */
export function canAutoApply(operations: readonly SceneOperation[]): boolean {
  return operations.length > 0 && operations.every(op =>
    op.type === "addNode" || op.type === "addEdge" || op.type === "updateNode" || op.type === "updateEdge",
  );
}

export function scheduleAutoDraw(submit: () => void): () => void {
  const timer = setTimeout(submit, AUTO_DRAW_PAUSE_MS);
  return () => clearTimeout(timer);
}
