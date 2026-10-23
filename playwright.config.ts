import { defineConfig } from "@playwright/test";

// Browser checks run against `next dev` with the E2E hook enabled; model calls are stubbed per test.
export default defineConfig({
  testDir: "e2e",
  timeout: 120_000,
  use: { baseURL: "http://localhost:3100", viewport: { width: 1440, height: 900 }, trace: "retain-on-failure" },
  webServer: {
    command: "npx next dev -p 3100",
    url: "http://localhost:3100",
    timeout: 180_000,
    reuseExistingServer: false,
    env: { NEXT_PUBLIC_E2E: "1" },
  },
});
