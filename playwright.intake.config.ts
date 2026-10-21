import { defineConfig, devices } from "@playwright/test";

/**
 * Intake attribution browser tests only.
 * The server command validates the disposable database before Next.js listens.
 * reuseExistingServer is off so an unrelated process on port 4001 is not reused.
 * Port 4000 is not used.
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: "intake-attribution.spec.ts",
  outputDir: "./test-results/playwright-intake",
  timeout: 180_000,
  workers: 1,
  use: { baseURL: "http://127.0.0.1:4001", ...devices["Desktop Chrome"] },
  webServer: {
    command: "pnpm exec tsx scripts/e2e-intake-server.ts",
    url: "http://127.0.0.1:4001/login",
    timeout: 180_000,
    reuseExistingServer: false,
  },
});
