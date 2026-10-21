/**
 * Shared Playwright server startup. The database guard runs before Next.js
 * is spawned, and an occupied port is a failure rather than a reused server.
 * This module does not read .env files.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";

import { assertE2eDatabase, E2eDatabaseGuardError } from "@/lib/testing/e2e-database-guard";

export function assertPlaywrightDatabase(
  env: Record<string, string | undefined> = process.env,
  requiredDatabase?: string,
) {
  const guarded = assertE2eDatabase(env);
  if (requiredDatabase && guarded.database !== requiredDatabase) {
    throw new E2eDatabaseGuardError("DATABASE_URL is not the approved Playwright database.");
  }
  return guarded;
}

export function assertPlaywrightPortFree(port: number) {
  return new Promise<void>((resolve, reject) => {
    const server = createServer();
    server.once("error", () => {
      reject(new E2eDatabaseGuardError(`Playwright port ${port} is already in use. Not attaching to it.`));
    });
    server.once("listening", () => {
      server.close(() => resolve());
    });
    server.listen(port, "127.0.0.1");
  });
}

export async function startGuardedPlaywrightServer(input: {
  port: number;
  distDir: string;
  requiredDatabase?: string;
  env?: Record<string, string | undefined>;
}): Promise<ChildProcess> {
  const env = input.env ?? process.env;
  assertPlaywrightDatabase(env, input.requiredDatabase);
  await assertPlaywrightPortFree(input.port);
  const databaseUrl = env.DATABASE_URL;
  const databaseName = env.E2E_DATABASE_NAME;
  if (!databaseUrl || !databaseName) {
    throw new E2eDatabaseGuardError("DATABASE_URL is not set in the process environment.");
  }
  const childEnv: NodeJS.ProcessEnv = { ...process.env };
  childEnv.DATABASE_URL = databaseUrl;
  childEnv.E2E_DATABASE_NAME = databaseName;
  childEnv.NEXT_DIST_DIR = input.distDir;
  return spawn("pnpm", ["exec", "next", "dev", "-p", String(input.port), "--hostname", "127.0.0.1"], {
    stdio: "inherit",
    env: childEnv,
  });
}
