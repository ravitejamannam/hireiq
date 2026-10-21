import {
  integrationDatabaseGate,
  publishIntegrationDatabaseGate,
} from "@/lib/testing/integration-database-gate";

/**
 * Vitest may load .env before test files. Remember the gate decision, then
 * drop a database URL the disposable guard does not accept. This file does
 * not connect.
 */
const gate = integrationDatabaseGate(process.env);
publishIntegrationDatabaseGate(gate);
if (gate.mode !== "accept") {
  delete process.env.DATABASE_URL;
  delete process.env.DIRECT_URL;
}
