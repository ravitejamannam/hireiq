import { createServer } from "node:net";
import { describe, expect, it } from "vitest";

import { E2eDatabaseGuardError } from "@/lib/testing/e2e-database-guard";
import { assertPlaywrightDatabase, assertPlaywrightPortFree } from "@/lib/testing/e2e-playwright-server";

const NAME = "hireiq_e2e_disp_import_20261020";
const url = (db: string, host = "localhost") => `postgresql://tester:pw-secret@${host}:5432/${db}`;

function reason(env: Record<string, string | undefined>, required?: string) {
  try {
    assertPlaywrightDatabase(env, required);
  } catch (error) {
    expect(error).toBeInstanceOf(E2eDatabaseGuardError);
    return (error as Error).message;
  }
  return null;
}

describe("assertPlaywrightDatabase", () => {
  it("accepts an explicit disposable database and does not read .env", () => {
    expect(assertPlaywrightDatabase({
      E2E_DATABASE_NAME: NAME,
      DATABASE_URL: url(NAME),
    }, NAME).database).toBe(NAME);
  });

  it("rejects a missing DATABASE_URL", () => {
    expect(reason({ E2E_DATABASE_NAME: NAME })).toContain("DATABASE_URL is not set");
  });

  it("rejects a missing E2E_DATABASE_NAME", () => {
    expect(reason({ DATABASE_URL: url(NAME) })).toContain("E2E_DATABASE_NAME is not set");
  });

  it("rejects hireiq, the protected database, a name mismatch, and a remote host", () => {
    expect(reason({ E2E_DATABASE_NAME: "hireiq", DATABASE_URL: url("hireiq") })).toContain("hireiq_e2e_disp_");
    expect(reason({
      E2E_DATABASE_NAME: "hireiq_e2e_full",
      DATABASE_URL: url("hireiq_e2e_full"),
    })).toContain("protected");
    expect(reason({
      E2E_DATABASE_NAME: NAME,
      DATABASE_URL: url("hireiq_e2e_disp_other"),
    })).toContain("does not match");
    expect(reason({
      E2E_DATABASE_NAME: NAME,
      DATABASE_URL: url(NAME, "db.example.com"),
    })).toContain("local machine");
  });

  it("rejects a disposable database that is not the one required by this server", () => {
    expect(reason({
      E2E_DATABASE_NAME: "hireiq_e2e_disp_other",
      DATABASE_URL: url("hireiq_e2e_disp_other"),
    }, NAME)).toContain("not the approved Playwright database");
  });
});

describe("assertPlaywrightPortFree", () => {
  it("fails when the port is occupied instead of attaching", async () => {
    const held = createServer();
    const port = await new Promise<number>((resolve, reject) => {
      held.once("error", reject);
      held.listen(0, "127.0.0.1", () => {
        const address = held.address();
        if (!address || typeof address === "string") {
          reject(new Error("No port"));
          return;
        }
        resolve(address.port);
      });
    });
    await expect(assertPlaywrightPortFree(port)).rejects.toThrow(/already in use/);
    await new Promise<void>((resolve) => held.close(() => resolve()));
  });
});
