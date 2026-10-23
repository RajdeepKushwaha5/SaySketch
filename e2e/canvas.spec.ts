import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { layoutGraph } from "../lib/render/layout";
import { buildPatch } from "../lib/scene/patch";
import { sceneToMermaid } from "../lib/scene/mermaid";
import type { ExcalidrawElement, GraphResponse } from "../types/diagram";

const graph: GraphResponse = {
  direction: "LR",
  nodes: [{ id: "web", label: "Web" }, { id: "api", label: "API" }, { id: "db", label: "Database" }],
  edges: [{ from: "web", to: "api" }, { from: "api", to: "db" }],
  groups: [],
};

type Hook = {
  handle: { getElements: () => ExcalidrawElement[]; applyPatch: (e: unknown, i: unknown) => void };
  api: () => { getAppState: () => { scrollX: number; scrollY: number; zoom: { value: number }; offsetLeft: number; offsetTop: number } };
};
const scene = (page: Page) => page.evaluate(() => (window as unknown as { __saysketch: Hook }).__saysketch.handle.getElements());
const live = (els: ExcalidrawElement[], id: string) => els.find(el => el.id === id && !el.isDeleted);
const end = (arrow: ExcalidrawElement) => ({ x: arrow.x + arrow.points.at(-1)[0], y: arrow.y + arrow.points.at(-1)[1] });

/** Viewport position of a shape's centre. */
async function centreOf(page: Page, id: string) {
  const el = live(await scene(page), id)!;
  const { scrollX, scrollY, zoom, offsetLeft, offsetTop } = await page.evaluate(() => (window as unknown as { __saysketch: Hook }).__saysketch.api().getAppState());
  return { x: (el.x + el.width / 2 + scrollX) * zoom.value + offsetLeft, y: (el.y + el.height / 2 + scrollY) * zoom.value + offsetTop, zoom: zoom.value };
}

/** Drag a shape by its centre using real pointer events. */
async function drag(page: Page, id: string, dx: number, dy: number) {
  const { x, y, zoom } = await centreOf(page, id);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx / 2, y + dy / 2, { steps: 5 });
  await page.mouse.move(x + dx, y + dy, { steps: 5 });
  await page.mouse.up();
  return zoom;
}

/** Open a new diagram and generate the three-node fixture through the real client pipeline (model stubbed). */
async function generate(page: Page, g: GraphResponse = graph) {
  const { elements } = layoutGraph(g);
  await page.route("**/api/generate-diagram", route => route.fulfill({ json: { elements, graph: g, files: [] } }));
  await page.goto("/d/new");
  // dev builds compile on first visit; wait for the canvas API before typing
  await page.waitForFunction(() => (window as unknown as { __saysketch?: { api: () => unknown } }).__saysketch?.api(), null, { timeout: 90_000 });
  const composer = page.getByTestId("composer");
  await composer.fill("Draw web, API and database");
  await composer.press("Enter");
  await expect.poll(async () => (await scene(page)).filter(el => el.type === "arrow").length, { timeout: 30_000 }).toBe(2);
  await page.keyboard.press("Escape");
  return composer;
}

const PROPOSAL = { status: "proposal", operations: [{ type: "addNode", ref: "new-1", label: "Cache", near: "api" }, { type: "addEdge", from: "api", to: "new-1" }] };

test("Auto draw creates after a pause, applies additions and preserves manual-review deletions", async ({ page }) => {
  const { elements } = layoutGraph(graph);
  await page.route("**/api/generate-diagram", route => route.fulfill({ json: { elements, graph, files: [] } }));
  await page.route("**/api/plan-edit", route => route.fulfill({ json: PROPOSAL }));
  await page.goto("/d/new");
  await page.waitForFunction(() => (window as unknown as { __saysketch?: { api: () => unknown } }).__saysketch?.api(), null, { timeout: 90_000 });
  await page.getByRole("switch", { name: "Auto draw after a pause" }).click();
  const composer = page.getByTestId("composer");
  await composer.fill("A web frontend calls an API, which reads a database");
  await expect.poll(async () => (await scene(page)).filter(el => el.type === "arrow").length, { timeout: 30_000 }).toBe(2);
  await expect(composer).toHaveValue("");
  const before = await scene(page);
  await composer.fill("Add a cache after the API");
  await expect(page.getByTestId("notice")).toContainText("Applied", { timeout: 30_000 });
  const after = await scene(page);
  expect(after.filter(el => !el.isDeleted && el.type === "rectangle")).toHaveLength(4);
  for (const id of ["web", "api", "db"]) {
    const original = live(before, id)!;
    expect(live(after, id)).toMatchObject({ x: original.x, y: original.y, width: original.width, height: original.height });
  }
  await page.unroute("**/api/plan-edit");
  await page.route("**/api/plan-edit", route => route.fulfill({ json: { status: "proposal", operations: [{ type: "removeNode", id: "db" }] } }));
  await composer.fill("Remove the database");
  await expect(page.getByTestId("proposal")).toBeVisible({ timeout: 30_000 });
  expect(live(await scene(page), "db")).toBeTruthy();
  await expect(page.getByRole("button", { name: "Apply", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(live(await scene(page), "db")).toBeTruthy();
});

test("generated arrows follow dragged nodes; a patch is one native undo step in chronological order", async ({ page }) => {
  await generate(page);
  const generated = await scene(page);
  const apiToDb = generated.find(el => el.type === "arrow" && el.customData?.yapdraw?.to === "db")!;
  expect(apiToDb.startBinding?.elementId).toBe("api");
  expect(apiToDb.endBinding?.elementId).toBe("db");
  expect(live(generated, "db")!.boundElements).toContainEqual(expect.objectContaining({ id: apiToDb.id, type: "arrow" }));

  // 1. A manual drag moves the node and its bound arrow end with it.
  const zoom = await drag(page, "db", 0, 150);
  const dragged = await scene(page);
  const db = live(dragged, "db")!;
  // the exact distance varies by a few px with layout; what matters is a real move and an attached arrow
  expect(db.y - live(generated, "db")!.y).toBeGreaterThan(120 / zoom);
  const tip = end(live(dragged, apiToDb.id)!);
  expect(tip.y).toBeGreaterThan(db.y - 10);
  expect(tip.y).toBeLessThan(db.y + db.height + 10);

  // 2. Apply an add+connect patch through the canvas handle as one captured update.
  const patch = buildPatch(dragged, PROPOSAL.operations);
  const created = (type: string) => patch.elements.find(el => el.type === type && !dragged.some(old => old.id === el.id))!.id;
  const cacheId = created("rectangle");
  const arrowId = created("arrow");
  await page.evaluate(([els, ids]) => (window as unknown as { __saysketch: Hook }).__saysketch.handle.applyPatch(els, ids), [patch.elements, patch.affectedIds] as const);
  const patched = await scene(page);
  expect(live(patched, cacheId)).toBeTruthy();
  const cacheText = patched.find(el => el.containerId === cacheId && !el.isDeleted)!;
  expect(cacheText.text).toBe("Cache");
  expect(cacheText.width).toBeGreaterThan(0);
  expect(live(patched, "db")!.y).toBe(db.y); // unrelated manual work kept

  // 3. A later manual drag, then undo twice: drag first, then the whole patch.
  await page.screenshot({ path: "test-results/after-patch.png" });
  await page.keyboard.press("Escape"); // close the style panel opened by the earlier selection
  const apiBefore = live(patched, "api")!.y;
  await drag(page, "api", 0, -120);
  expect(live(await scene(page), "api")!.y).not.toBe(apiBefore);
  await page.keyboard.press("Control+z");
  await expect.poll(async () => live(await scene(page), "api")!.y).toBeCloseTo(apiBefore, 0);
  expect(live(await scene(page), cacheId)).toBeTruthy();
  await page.keyboard.press("Control+z");
  await expect.poll(async () => live(await scene(page), cacheId)).toBeUndefined();
  const undone = await scene(page);
  expect(undone.filter(el => !el.isDeleted && el.containerId === cacheId)).toHaveLength(0);
  expect(live(undone, arrowId)).toBeUndefined();
  expect(live(undone, "api")!.boundElements.map((b: { id: string }) => b.id)).not.toContain(arrowId);
  expect(live(undone, "db")!.y).toBe(db.y); // the earlier drag survives undoing the patch

  // 4. Redo restores the whole patch at once.
  await page.keyboard.press("Control+Shift+z");
  await expect.poll(async () => live(await scene(page), cacheId)).toBeTruthy();
  expect((await scene(page)).find(el => el.containerId === cacheId && !el.isDeleted)?.text).toBe("Cache");
});

test("select, dictate, review and apply; one undo removes the change; Mermaid export parses", async ({ page }) => {
  const composer = await generate(page);
  let request: { instruction: string; context: { selected: string[]; nodes: { id: string }[] } } | undefined;
  await page.route("**/api/plan-edit", async route => {
    request = route.request().postDataJSON();
    await route.fulfill({ json: PROPOSAL });
  });

  // Point at the API node, then speak.
  const { x, y } = await centreOf(page, "api");
  await page.mouse.click(x, y);
  await expect(page.getByTestId("selection-chip")).toHaveText("Editing: API");
  await composer.fill("put a cache next to this, uh, and connect it");
  await composer.press("Enter");

  const proposal = page.getByTestId("proposal");
  await expect(proposal).toContainText("Add “Cache” near “API”.");
  await expect(proposal).toContainText("Connect “API” → “Cache”.");
  expect(request?.context.selected).toEqual(["api"]);
  expect(request?.context.nodes.map(n => n.id).sort()).toEqual(["api", "db", "web"]);
  await expect(composer).toHaveValue(""); // accepted instructions clear the box
  const before = await scene(page);
  expect(before.some(el => el.containerId && el.text === "Cache")).toBe(false); // preview does not mutate

  await proposal.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByTestId("notice")).toContainText("Applied");
  const after = await scene(page);
  const cache = after.find(el => el.type === "text" && el.text === "Cache" && !el.isDeleted)!;
  expect(cache).toBeTruthy();
  for (const el of before.filter(el => el.type !== "rectangle" || el.id !== "api")) {
    const now = live(after, el.id)!;
    expect([now.x, now.y]).toEqual([el.x, el.y]); // nothing else moved
  }

  // The live-canvas Mermaid export includes the applied change and parses with the real Mermaid parser.
  const { text } = sceneToMermaid(after);
  expect(text).toContain('"Cache"');
  await page.addScriptTag({ path: path.join(process.cwd(), "node_modules/mermaid/dist/mermaid.min.js") });
  expect(await page.evaluate(async source => {
    const mermaid = (window as unknown as { mermaid: { parse: (s: string) => Promise<unknown> } }).mermaid;
    return Boolean(await mermaid.parse(source));
  }, text)).toBe(true);

  // Focus the canvas, then a single undo removes the whole instruction.
  const empty = await centreOf(page, "web");
  await page.mouse.click(empty.x, empty.y + 250);
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await scene(page)).some(el => el.type === "text" && el.text === "Cache" && !el.isDeleted)).toBe(false);
  expect((await scene(page)).filter(el => el.type === "arrow" && !el.isDeleted)).toHaveLength(2);
});

test("an edit made while a proposal is open blocks Apply and offers to plan again", async ({ page }) => {
  const composer = await generate(page);
  await page.route("**/api/plan-edit", route => route.fulfill({ json: PROPOSAL }));
  await composer.fill("add a cache near the API");
  await composer.press("Enter");
  await expect(page.getByTestId("proposal")).toBeVisible();
  // "db" sits clear of the style panel that the preview highlight opens
  const dbBefore = live(await scene(page), "db")!.y;
  await drag(page, "db", 0, 140);
  expect(live(await scene(page), "db")!.y).not.toBe(dbBefore);
  await page.getByTestId("proposal").getByRole("button", { name: "Apply" }).click();
  const notice = page.getByTestId("notice");
  await expect(notice).toHaveAttribute("data-kind", "conflict");
  await expect(notice.getByRole("button", { name: "Plan again" })).toBeVisible();
  expect((await scene(page)).some(el => el.type === "text" && el.text === "Cache")).toBe(false);
  await expect(page.getByTestId("proposal")).toHaveCount(0);
});

test("dragging a node with labelled connections and icons does not crash (real model output shape)", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", err => errors.push(err.message));
  // shape of a real gpt-oss generation: icons and connection labels
  await generate(page, {
    direction: "LR",
    nodes: [{ id: "web", label: "React Frontend", icon: "react" }, { id: "api", label: "Node API" }, { id: "db", label: "Postgres", icon: "postgresql" }],
    edges: [{ from: "web", to: "api", label: "HTTP" }, { from: "api", to: "db", label: "SQL" }],
    groups: [],
  });
  await drag(page, "api", 0, 160);
  await page.mouse.click(5, 5);
  const els = await scene(page);
  const sql = els.find(el => el.type === "text" && el.text === "SQL" && !el.isDeleted)!;
  expect(sql.originalText).toBe("SQL");
  expect(live(els, sql.containerId)?.type).toBe("arrow");
  expect(errors).toEqual([]);
});

test("a clarification keeps the dictated instruction for editing", async ({ page }) => {
  const composer = await generate(page);
  await page.route("**/api/plan-edit", route => route.fulfill({ json: { status: "clarification", question: "Which database do you mean?" } }));
  await composer.fill("rename the database to Postgres");
  await composer.press("Enter");
  await expect(page.getByTestId("notice")).toHaveAttribute("data-kind", "question");
  await expect(page.getByTestId("notice")).toContainText("Which database do you mean?");
  await expect(composer).toHaveValue("rename the database to Postgres");
});

test("the example diagram opens ready to edit, with suggestions, and accepts a patch", async ({ page }) => {
  await page.goto("/d/new?example=1");
  await page.waitForFunction(() => (window as unknown as { __saysketch?: { api: () => unknown } }).__saysketch?.api(), null, { timeout: 90_000 });
  await expect.poll(async () => (await scene(page)).filter(el => el.type === "arrow").length, { timeout: 30_000 }).toBe(5);
  const els = await scene(page);
  expect(els.filter(el => el.type === "rectangle" && el.customData?.yapdraw?.type === "node")).toHaveLength(6);
  expect(els.filter(el => el.type === "arrow").every(a => a.startBinding?.elementId && a.endBinding?.elementId)).toBe(true);
  await expect(page).toHaveURL(/\/d\/[^?]+$/); // the one-shot flag is dropped
  await expect(page.getByText("Try saying", { exact: true })).toBeVisible();

  await page.route("**/api/plan-edit", route => route.fulfill({ json: { status: "proposal", operations: [
    { type: "addNode", ref: "new-1", label: "Email Queue", near: "orders" }, { type: "addEdge", from: "orders", to: "new-1" },
  ] } }));
  await page.getByRole("button", { name: /Add a queue for confirmation emails/ }).click();
  await page.getByTestId("proposal").getByRole("button", { name: "Apply" }).click();
  await expect.poll(async () => (await scene(page)).some(el => el.type === "text" && el.text === "Email Queue" && !el.isDeleted)).toBe(true);
});

test("a failed generation keeps the instruction in the box", async ({ page }) => {
  await page.route("**/api/generate-diagram", route => route.fulfill({ status: 429, json: { error: "Too many requests. Try again in 30s." } }));
  await page.goto("/d/new");
  await page.waitForFunction(() => (window as unknown as { __saysketch?: { api: () => unknown } }).__saysketch?.api(), null, { timeout: 90_000 });
  const composer = page.getByTestId("composer");
  await composer.fill("Draw web, API and database");
  await composer.press("Enter");
  await expect(page.getByText("Too many requests. Try again in 30s.")).toBeVisible();
  await expect(composer).toHaveValue("Draw web, API and database");
});

test("JSON backup includes embedded files", async ({ page }) => {
  await page.goto("/d/new?example=1");
  await page.waitForFunction(() => (window as unknown as { __saysketch?: { api: () => unknown } }).__saysketch?.api(), null, { timeout: 90_000 });
  await expect.poll(async () => (await scene(page)).filter(el => el.type === "image").length, { timeout: 30_000 }).toBeGreaterThan(0);
  await page.locator("button:has(svg.tabler-icon-dots-vertical)").first().click();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export as JSON" }).click()]);
  const backup = JSON.parse(await (await import("node:fs/promises")).readFile((await download.path())!, "utf8"));
  const imageFileIds = backup.elements.filter((el: { type: string }) => el.type === "image").map((el: { fileId: string }) => el.fileId);
  expect(imageFileIds.length).toBeGreaterThan(0);
  for (const fileId of imageFileIds) expect(backup.files[fileId]?.dataURL).toMatch(/^data:image\//);
});

test("history preview blocks instructions and returns to the current editable scene", async ({ page }) => {
  const composer = await generate(page);
  await expect(composer).toHaveValue("");
  await page.getByRole("button", { name: "Save version checkpoint" }).click();
  await expect(page.getByRole("button", { name: "v2now", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "v1", exact: true }).click();
  await expect(composer).toBeDisabled();
  await expect(page.getByText("History preview — return to current to edit")).toBeVisible();
  await page.getByRole("button", { name: "Back to current", exact: true }).click();
  await expect(composer).toBeEnabled();
  await expect.poll(async () => (await scene(page)).filter(el => el.type === "arrow" && !el.isDeleted).length).toBe(2);
});

test("Back to library saves a rapid manual edit before navigation", async ({ page }) => {
  await generate(page);
  const editorUrl = page.url();
  await drag(page, "db", 0, 90);
  const movedY = live(await scene(page), "db")!.y;
  await page.getByRole("button", { name: "Back to library", exact: true }).click();
  await expect(page).toHaveURL(/\/library$/, { timeout: 30_000 });
  await page.goto(editorUrl);
  await page.waitForFunction(() => (window as unknown as { __saysketch?: { api: () => unknown } }).__saysketch?.api(), null, { timeout: 90_000 });
  expect(live(await scene(page), "db")!.y).toBe(movedY);
});
