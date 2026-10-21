import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./test-results/playwright",
  timeout: 90_000,
  use: { baseURL: "http://localhost:4001", ...devices["Desktop Chrome"] },
  webServer: {
    command: "pnpm exec tsx scripts/e2e-playwright-server.ts",
    url: "http://127.0.0.1:4001/login",
    timeout: 180_000,
    reuseExistingServer: false,
  },
});
