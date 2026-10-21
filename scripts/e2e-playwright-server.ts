/**
 * Default Playwright server. Fails before Next.js listens unless
 * DATABASE_URL and E2E_DATABASE_NAME name the same local disposable database.
 * Does not read .env and does not attach to an existing listener.
 */
import { startGuardedPlaywrightServer } from "@/lib/testing/e2e-playwright-server";

async function main() {
  const child = await startGuardedPlaywrightServer({
    port: 4001,
    distDir: ".next-e2e",
  });
  child.on("exit", (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    process.exit(code ?? 1);
  });
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Playwright server refused to start.");
  process.exit(1);
});
