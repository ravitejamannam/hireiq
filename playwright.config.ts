import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  use: { baseURL: "http://localhost:4001", ...devices["Desktop Chrome"] },
  webServer: {
    command: "pnpm exec next dev -p 4001",
    url: "http://localhost:4001/login",
    timeout: 180_000,
    reuseExistingServer: true,
    env: {
      ...process.env,
      NEXT_DIST_DIR: ".next-e2e",
    },
  },
});
