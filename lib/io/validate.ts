import type { BinaryFileData, ExcalidrawElement } from "@/types/diagram";

export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;
const TYPES = new Set(["rectangle", "diamond", "ellipse", "arrow", "line", "text", "image", "freedraw", "frame", "magicframe", "embeddable", "iframe"]);
type ImportedScene = { elements: ExcalidrawElement[]; files: Record<string, BinaryFileData> };
const record = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === "object" && !Array.isArray(v);

/** Reject corrupt backups before creating a library document. Preserve native fields verbatim. */
export function validateImportedScene(value: unknown): ImportedScene {
  if (!record(value) || !Array.isArray(value.elements) || value.elements.length > 10_000) throw new Error("Backup must contain an elements array with at most 10,000 elements.");
  const ids = new Set<string>();
  for (const el of value.elements) {
    if (!record(el) || typeof el.id !== "string" || !el.id || ids.has(el.id) || typeof el.type !== "string" || !TYPES.has(el.type)) throw new Error("Backup contains an invalid element type or duplicate/missing ID.");
    ids.add(el.id);
    for (const key of ["x", "y", "width", "height", "angle"]) {
      if (el[key] !== undefined && (typeof el[key] !== "number" || !Number.isFinite(el[key]))) throw new Error("Backup contains invalid element geometry.");
    }
    if (el.points !== undefined && (!Array.isArray(el.points) || !el.points.every(point => Array.isArray(point) && point.length === 2 && point.every(n => typeof n === "number" && Number.isFinite(n))))) throw new Error("Backup contains invalid drawing points.");
  }
  const files = value.files ?? {};
  if (!record(files) || Object.keys(files).length > 1000) throw new Error("Backup contains an invalid files collection.");
  for (const [id, file] of Object.entries(files)) {
    if (!record(file) || file.id !== id || typeof file.mimeType !== "string" || !file.mimeType.startsWith("image/") || typeof file.dataURL !== "string" || !file.dataURL.startsWith(`data:${file.mimeType}`) || typeof file.created !== "number" || !Number.isFinite(file.created)) throw new Error("Backup contains invalid embedded image data.");
  }
  for (const el of value.elements) {
    if (!el.isDeleted && el.type === "image" && (typeof el.fileId !== "string" || !Object.hasOwn(files, el.fileId))) throw new Error("Backup is missing an embedded image. Use a complete .excalidraw or project JSON backup.");
  }
  return { elements: value.elements as ExcalidrawElement[], files: files as Record<string, BinaryFileData> };
}

export async function readBackup(file: File): Promise<Record<string, unknown> & ImportedScene> {
  if (file.size > MAX_IMPORT_BYTES) throw new Error("Backup is too large. The import limit is 10 MB.");
  let value: unknown;
  try { value = JSON.parse(await file.text()); }
  catch { throw new Error("This file is not valid JSON."); }
  const scene = validateImportedScene(value);
  return { ...(value as Record<string, unknown>), ...scene };
}
