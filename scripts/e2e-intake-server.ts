/**
 * Intake Playwright server. Same guard as the default server, plus the
 * exact disposable database used by the intake spec. Does not read .env
 * and does not attach to an existing listener.
 */
import { startGuardedPlaywrightServer } from "@/lib/testing/e2e-playwright-server";

const APPROVED_DATABASE = "hireiq_e2e_disp_import_20261020";

async function main() {
  const child = await startGuardedPlaywrightServer({
    port: 4001,
    distDir: ".next-e2e-intake",
    requiredDatabase: APPROVED_DATABASE,
  });
  child.on("exit", (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    process.exit(code ?? 1);
  });
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Intake E2E server failed.");
  process.exit(1);
});
