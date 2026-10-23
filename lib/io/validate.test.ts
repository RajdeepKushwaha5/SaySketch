import { describe, expect, it } from "vitest";
import { MAX_IMPORT_BYTES, readBackup, validateImportedScene } from "./validate";

const file = { id: "image", mimeType: "image/png", dataURL: "data:image/png;base64,aGVsbG8=", created: 1 };
describe("backup validation", () => {
  it("preserves embedded files, annotations and native fields", () => {
    const elements = [{ id: "img", type: "image", fileId: "image", x: 1, y: 2, customData: { hello: "world" } }, { id: "note", type: "freedraw", points: [[0, 0], [4, 8]] }];
    const result = validateImportedScene({ elements, files: { image: file } });
    expect(result.elements).toBe(elements);
    expect(result.files.image).toBe(file);
  });
  it.each([null, [], {}, { elements: [{ id: "a", type: "rectangle" }, { id: "a", type: "text" }] }, { elements: [{ id: "a", type: "rectangle", x: Infinity }] }, { elements: [{ id: "a", type: "line", points: [[0, "bad"]] }] }, { elements: [], files: [] }])("rejects malformed scenes without a document write", value => expect(() => validateImportedScene(value)).toThrow());
  it("rejects missing image bytes but permits legacy scenes without images", () => {
    expect(() => validateImportedScene({ elements: [{ id: "i", type: "image", fileId: "missing" }] })).toThrow("missing an embedded image");
    expect(validateImportedScene({ elements: [{ id: "a", type: "rectangle" }] }).files).toEqual({});
  });
  it("reports invalid JSON and checks size before reading", async () => {
    await expect(readBackup(new File(["not json"], "bad.json"))).rejects.toThrow("not valid JSON");
    await expect(readBackup({ size: MAX_IMPORT_BYTES + 1 } as File)).rejects.toThrow("10 MB");
  });
});
