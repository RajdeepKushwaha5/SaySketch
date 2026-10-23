import { expect, test } from "@playwright/test";
import { layoutGraph } from "../lib/render/layout";

test.use({ permissions: ["microphone"] });
test("an unfinished clause waits, and Stop receives the final transcript before closing", async ({ page }) => {
  await page.route("**/api/voice", route => route.fulfill({ json: { live: true } }));
  await page.route("**/api/deepgram-token", route => route.fulfill({ json: { key: "test-key" } }));
  const graph = { nodes: [{ id: "backend", label: "Backend" }, { id: "mongo", label: "MongoDB" }], edges: [{ from: "backend", to: "mongo" }] };
  const requests: string[] = [];
  await page.route("**/api/generate-diagram", route => {
    requests.push(route.request().postDataJSON().transcript);
    return route.fulfill({ json: { ...layoutGraph(graph), graph, files: [] } });
  });
  let socket: { send: (text: string) => void } | undefined;
  const final = (text: string) => socket!.send(JSON.stringify({ type: "Results", is_final: true, channel: { alternatives: [{ transcript: text }] } }));
  await page.routeWebSocket(/api\.deepgram\.com/, ws => {
    socket = ws;
    ws.onMessage(message => {
      if (typeof message === "string" && message.includes("CloseStream")) {
        final("Actually use MongoDB instead.");
        ws.send(JSON.stringify({ type: "Metadata" }));
      }
    });
  });
  await page.goto("/d/new");
  await page.getByRole("button", { name: "Start recording", exact: true }).click();
  await expect.poll(() => Boolean(socket)).toBe(true);
  final("The backend writes to");
  socket!.send(JSON.stringify({ type: "UtteranceEnd" }));
  // Exceed both the normal speech boundary delay and mic send delay. An unfinished thought must wait.
  await page.waitForTimeout(1800);
  expect(requests).toEqual([]);
  final("Postgres.");
  socket!.send(JSON.stringify({ is_final: false, channel: { alternatives: [{ transcript: "Actually no" }] } }));
  // Resumed speech cancels the commit timer, even though the earlier clause is now complete.
  await page.waitForTimeout(1800);
  expect(requests).toEqual([]);
  await page.getByRole("button", { name: "Stop recording", exact: true }).click();
  await expect.poll(() => requests.length, { timeout: 15000 }).toBe(1);
  expect(requests).toEqual(["The backend writes to PostgreSQL. Actually use MongoDB instead."]);
  await expect(page.getByRole("button", { name: "Start recording", exact: true })).toBeVisible();
});
