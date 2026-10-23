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

/**
 * Text left in the composer after `sent` was accepted. Flow appends while a plan is in flight,
 * so only the newly dictated tail stays; edited text is kept whole rather than guessed at.
 */
export function remainingAfterSend(current: string, sent: string): string {
  const head = current.trimStart();
  const done = sent.trim();
  if (head.startsWith(done)) return head.slice(done.length).trimStart();
  return current;
}
