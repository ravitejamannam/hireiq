import { assertE2eDatabase } from "@/lib/testing/e2e-database-guard";

/**
 * Skip only when no database URL was configured. Any configured URL that the
 * disposable guard rejects fails the suite instead of being skipped.
 * This function does not open a connection and does not read .env.
 */
export type IntegrationDatabaseGate =
  | { mode: "accept"; database: string }
  | { mode: "skip" }
  | { mode: "reject"; message: string };

let published: IntegrationDatabaseGate | null = null;

export function publishIntegrationDatabaseGate(gate: IntegrationDatabaseGate) {
  published = gate;
}

export function integrationDatabaseGate(
  env?: Record<string, string | undefined>,
): IntegrationDatabaseGate {
  if (!env && published) return published;
  const source = env ?? process.env;
  if (!source.DATABASE_URL?.trim()) return { mode: "skip" };
  try {
    return { mode: "accept", database: assertE2eDatabase(source).database };
  } catch (error) {
    return {
      mode: "reject",
      message: error instanceof Error ? error.message : "Database target was rejected.",
    };
  }
}

/** Throws before a suite runs when the configured database is unsafe. */
export function gateIntegrationSuite() {
  const gate = integrationDatabaseGate();
  if (gate.mode === "reject") {
    throw new Error(gate.message);
  }
  return gate;
}
