import { describe, expect, it } from "vitest";

import {
  gateIntegrationSuite,
  integrationDatabaseGate,
  publishIntegrationDatabaseGate,
} from "@/lib/testing/integration-database-gate";

const NAME = "hireiq_e2e_disp_import_20261020";
const url = (db: string, host = "localhost") => `postgresql://tester:pw-secret@${host}:5432/${db}`;

describe("integrationDatabaseGate", () => {
  it("skips when no database URL is configured", () => {
    expect(integrationDatabaseGate({}).mode).toBe("skip");
    expect(integrationDatabaseGate({ E2E_DATABASE_NAME: NAME }).mode).toBe("skip");
  });

  it("rejects an explicit hireiq URL, the protected database, a mismatch, and a remote host", () => {
    expect(integrationDatabaseGate({
      DATABASE_URL: url("hireiq"),
      E2E_DATABASE_NAME: "hireiq",
    })).toMatchObject({ mode: "reject" });
    expect(integrationDatabaseGate({
      DATABASE_URL: url("hireiq_e2e_full"),
      E2E_DATABASE_NAME: "hireiq_e2e_full",
    }).mode).toBe("reject");
    expect(integrationDatabaseGate({
      DATABASE_URL: url("hireiq_e2e_disp_other"),
      E2E_DATABASE_NAME: NAME,
    })).toMatchObject({ mode: "reject", message: expect.stringContaining("does not match") });
    expect(integrationDatabaseGate({
      DATABASE_URL: url(NAME, "db.example.com"),
      E2E_DATABASE_NAME: NAME,
    })).toMatchObject({ mode: "reject", message: expect.stringContaining("local machine") });
  });

  it("rejects a configured URL that omits E2E_DATABASE_NAME", () => {
    expect(integrationDatabaseGate({ DATABASE_URL: url(NAME) })).toMatchObject({
      mode: "reject",
      message: expect.stringContaining("E2E_DATABASE_NAME is not set"),
    });
  });

  it("accepts an explicit approved disposable database without reading .env", () => {
    expect(integrationDatabaseGate({
      DATABASE_URL: url(NAME),
      E2E_DATABASE_NAME: NAME,
    })).toEqual({ mode: "accept", database: NAME });
  });

  it("fails the suite for a remembered unsafe decision and skips only an absent URL", () => {
    const current = integrationDatabaseGate();
    try {
      publishIntegrationDatabaseGate({ mode: "reject", message: "Database target was rejected." });
      expect(() => gateIntegrationSuite()).toThrow(/rejected/);
      publishIntegrationDatabaseGate({ mode: "skip" });
      expect(gateIntegrationSuite()).toEqual({ mode: "skip" });
    } finally {
      publishIntegrationDatabaseGate(current);
    }
  });
});
