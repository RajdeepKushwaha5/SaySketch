import { defineConfig } from "@playwright/test";
import path from "node:path";

const port = Number(process.env.E2E_PORT || 3100);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Invalid E2E_PORT");

// Browser checks run against `next dev` with the E2E hook enabled; model calls are stubbed per test.
export default defineConfig({
  testDir: "e2e",
  timeout: 120_000,
  use: { baseURL: `http://localhost:${port}`, viewport: { width: 1440, height: 900 }, trace: "retain-on-failure" },
  webServer: {
    command: `"${process.execPath}" "${path.join(process.cwd(), "node_modules/next/dist/bin/next")}" dev --webpack -p ${port}`,
    url: `http://localhost:${port}`,
    timeout: 180_000,
    reuseExistingServer: process.env.E2E_REUSE_SERVER === "1",
    // defaults to the shared .next: a second build dir is ~700 MB and has filled drive D: before.
    // Set NEXT_DIST_DIR (e.g. a junction to another drive) to run beside a dev server.
    env: { NEXT_PUBLIC_E2E: "1", NEXT_DIST_DIR: process.env.NEXT_DIST_DIR || ".next" },
  },
});
