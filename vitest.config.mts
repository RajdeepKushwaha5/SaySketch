import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: {
    include: ["lib/**/*.test.ts", "app/**/*.test.ts"],
    environment: "node",
    // only the opt-in live evaluation sees real credentials from .env.local
    env: process.env.LIVE_EVAL === "1" ? loadEnv("", process.cwd(), "") : {},
  },
});
