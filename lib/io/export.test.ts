import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDiagram } from "../diagram";
import { exportAsJSON, exportBulkAsZip } from "./export";
import JSZip from "jszip";

const { save } = vi.hoisted(() => ({ save: vi.fn() }));
vi.mock("file-saver", () => ({ saveAs: save }));
beforeEach(() => save.mockClear());
describe("complete JSON backups", () => {
  const diagram = createDiagram({ name: "Backup", files: { image: { id: "image", mimeType: "image/svg+xml", dataURL: "data:image/svg+xml;base64,PHN2Zy8+", created: 1 } } });
  it("includes image bytes in a single backup", async () => {
    exportAsJSON(diagram);
    const json = JSON.parse(await (save.mock.calls[0][0] as Blob).text());
    expect(json.files).toEqual(diagram.files);
  });
  it("includes image bytes inside a bulk JSON archive", async () => {
    await exportBulkAsZip([diagram], "json");
    const zip = await JSZip.loadAsync(await (save.mock.calls[0][0] as Blob).arrayBuffer());
    const json = JSON.parse(await zip.file("Backup.json")!.async("string"));
    expect(json.files).toEqual(diagram.files);
  });
  it("does not overwrite documents with matching or sanitized filenames", async () => {
    await exportBulkAsZip([{ ...diagram, name: "A/B" }, { ...diagram, name: "A\\B" }, { ...diagram, name: "a-b" }], "json");
    const zip = await JSZip.loadAsync(await (save.mock.calls[0][0] as Blob).arrayBuffer());
    expect(Object.keys(zip.files)).toEqual(["A-B.json", "A-B (2).json", "a-b (3).json"]);
  });
});
