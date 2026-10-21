import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { assertE2eDatabase, E2eDatabaseGuardError } from "./e2e-database-guard";

// Synthetic values only. Nothing here connects to a database.
const NAME = "hireiq_e2e_disp_20261020a";
const url = (db: string, host = "localhost", query = "") => `postgresql://tester:pw-secret@${host}:5432/${db}${query}`;
const ok = { E2E_DATABASE_NAME: NAME, DATABASE_URL: url(NAME) };

function reason(env: Record<string, string | undefined>) {
  try {
    assertE2eDatabase(env);
  } catch (error) {
    expect(error).toBeInstanceOf(E2eDatabaseGuardError);
    return (error as Error).message;
  }
  return null;
}

describe("assertE2eDatabase", () => {
  it("accepts an exact name match on a local host", () => {
    expect(assertE2eDatabase(ok)).toEqual({ database: NAME });
    expect(assertE2eDatabase({ ...ok, DATABASE_URL: url(NAME, "127.0.0.1", "?connection_limit=4") }).database).toBe(NAME);
  });

  it("rejects a missing E2E_DATABASE_NAME", () => {
    expect(reason({ DATABASE_URL: ok.DATABASE_URL })).toContain("E2E_DATABASE_NAME is not set");
    expect(reason({ ...ok, E2E_DATABASE_NAME: "" })).toContain("not set");
  });

  it("rejects a missing DATABASE_URL (no fallback to .env files)", () => {
    expect(reason({ E2E_DATABASE_NAME: NAME })).toContain("DATABASE_URL is not set");
  });

  it("rejects a malformed or non-PostgreSQL DATABASE_URL", () => {
    expect(reason({ ...ok, DATABASE_URL: "not a url" })).toContain("not a valid URL");
    expect(reason({ ...ok, DATABASE_URL: `mysql://localhost/${NAME}` })).toContain("not a PostgreSQL URL");
    expect(reason({ ...ok, DATABASE_URL: "postgresql://localhost:5432" })).toContain("exactly one database");
    expect(reason({ ...ok, DATABASE_URL: `postgresql://localhost/${NAME}/extra` })).toContain("exactly one database");
    expect(reason({ ...ok, DATABASE_URL: `postgresql://localhost/%E0%A4%A` })).toContain("malformed");
  });

  it("rejects a database-name mismatch, including prefix and suffix lookalikes", () => {
    expect(reason({ ...ok, DATABASE_URL: url("hireiq_e2e_disp_other") })).toContain("does not match");
    expect(reason({ ...ok, DATABASE_URL: url(`${NAME}_x`) })).toContain("does not match");
    expect(reason({ ...ok, DATABASE_URL: url("hireiq") })).toContain("does not match");
  });

  it("rejects the protected database however it is named", () => {
    const protectedName = "hireiq_e2e_full";
    expect(reason({ E2E_DATABASE_NAME: protectedName, DATABASE_URL: url(protectedName) })).toContain("protected");
    expect(reason({ E2E_DATABASE_NAME: `${protectedName}_copy`, DATABASE_URL: url(`${protectedName}_copy`) })).toContain("protected");
    expect(reason({ E2E_DATABASE_NAME: `hireiq_e2e_disp_${protectedName}`, DATABASE_URL: url(`hireiq_e2e_disp_${protectedName}`) })).toContain("protected");
    expect(reason({ ...ok, DATABASE_URL: url(protectedName) })).toContain("protected");
  });

  it("rejects names that are not clearly disposable", () => {
    for (const name of ["hireiq", "hireiq_test", "hireiq_e2e", "hireiq_e2e_disp_", "HIREIQ_E2E_DISP_X", "x; drop"]) {
      expect(reason({ E2E_DATABASE_NAME: name, DATABASE_URL: url(name) })).not.toBeNull();
    }
  });

  it("decodes an encoded database path before comparing", () => {
    expect(assertE2eDatabase({ ...ok, DATABASE_URL: url("hireiq_e2e_disp_%32%30%32%36%31%30%32%30a") }).database).toBe(NAME);
    // An encoded protected name is still the protected name.
    expect(reason({ ...ok, DATABASE_URL: url("hireiq_e2e_%66ull") })).toContain("protected");
    expect(reason({ E2E_DATABASE_NAME: NAME, DATABASE_URL: url("%68ireiq_e2e_full") })).toContain("protected");
  });

  it("rejects remote hosts and options that could redirect the connection", () => {
    expect(reason({ ...ok, DATABASE_URL: url(NAME, "db.example.com") })).toContain("local machine");
    expect(reason({ ...ok, DATABASE_URL: url(NAME, "localhost", "?host=db.example.com") })).toContain("redirect");
    expect(reason({ ...ok, DATABASE_URL: url(NAME, "localhost", "?dbname=hireiq") })).toContain("redirect");
  });

  it("never puts the URL, host details or credentials in an error", () => {
    for (const env of [
      { ...ok, DATABASE_URL: url("hireiq_e2e_disp_other") },
      { ...ok, DATABASE_URL: "postgresql://tester:pw-secret@db.example.com/x" },
      { ...ok, DATABASE_URL: "garbage pw-secret" },
    ]) {
      const message = reason(env) ?? "";
      expect(message).not.toContain("pw-secret");
      expect(message).not.toContain("tester");
      expect(message).not.toContain("db.example.com");
    }
  });
});

describe("E2E seed scripts call the guard before any database access", () => {
  const scripts = ["e2e-full-run", "e2e-second-role", "e2e-remaining-flows", "e2e-full-followup", "e2e-playwright-prep", "seed-assessment-bank"];

  it.each(scripts)("%s", (name) => {
    const source = readFileSync(`scripts/${name}.ts`, "utf8");
    expect(source).not.toMatch(/includes\("hireiq_e2e_full"\)/);
    expect(source).toMatch(/from "(?:@|\.\.)\/lib\/testing\/e2e-database-guard"/);
    // Everything outside function bodies runs at import time, before main(); it must not query.
    const mainAt = source.search(/^async function main\(/m);
    expect(mainAt).toBeGreaterThan(0);
    const guardAt = mainAt + source.slice(mainAt).search(/^\s*(?:assertE2eDatabase|assertDb)\(\);/m);
    expect(guardAt).toBeGreaterThan(mainAt);
    const queryPattern = /\b(?:prisma|owner|tx)\s*\.\s*(?:\$|[a-z][A-Za-z]+\s*\.)|\bnew PrismaClient\(/;
    const beforeGuard = source.slice(0, guardAt);
    // Only code at the top level (not inside earlier helper functions) may run before main; the
    // sole earlier call allowed is the guard itself inside assertDb in e2e-full-run.
    const mainBody = source.slice(mainAt, guardAt);
    expect(mainBody).not.toMatch(queryPattern);
    const topLevelOnly = beforeGuard.replace(/^(?:async )?function [\s\S]*?^}/gm, "");
    expect(topLevelOnly).not.toMatch(queryPattern);
  });

  it("e2e-full-run calls its guard as the first statement of main", () => {
    const source = readFileSync("scripts/e2e-full-run.ts", "utf8");
    expect(source).toMatch(/async function main\(\) \{\n  assertDb\(\);/);
    expect(source).toMatch(/function assertDb\(\) \{\n  assertE2eDatabase\(\);/);
  });
});

describe("seed-assessment-bank", () => {
  const source = readFileSync("scripts/seed-assessment-bank.ts", "utf8");

  it("guards before the seeder runs and never loads .env on its own", () => {
    expect(source).not.toMatch(/dotenv/);
    const guardAt = source.indexOf("assertE2eDatabase();");
    const seedAt = source.indexOf("await upsertAssessmentBank(");
    expect(guardAt).toBeGreaterThan(0);
    expect(seedAt).toBeGreaterThan(guardAt);
    expect(source.match(/upsertAssessmentBank\(/g)).toHaveLength(1);
    // The only direct client use is the final disconnect; no other query can precede the guard.
    expect(source.match(/prisma\s*\.\s*[a-z$]\w*/g)).toEqual(["prisma.$disconnect"]);
  });
});
